import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { Plan } from '@prisma/client';
import { Organization } from 'generated/prisma';

@Injectable()
export class BillingService {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  constructor(private prisma: PrismaService) { }

  private priceId(plan: Plan) {
    switch (plan) {
      case 'ADVANCED': return process.env.STRIPE_PRICE_ADVANCED!;
      case 'PREMIUM': return process.env.STRIPE_PRICE_PREMIUM!;
      default: return process.env.STRIPE_PRICE_BASIC!;
    }
  }

  private seatLimit(plan: Plan) {
    switch (plan) {
      case 'ADVANCED': return 6;
      case 'PREMIUM': return 9;
      default: return 3;
    }
  }

  /** Cria (ou reaproveita) Customer, cria org se não houver, e retorna a URL da Checkout Session */
  async createCheckoutSessionForUser(
    email: string,
    plan: Plan,
    org: Organization
  ) {

    // 1) Customer no Stripe
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email,
        metadata: { orgId: org.id },
      });
      customerId = customer.id;
      await this.prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // 2) Checkout Session (subscription)
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.priceId(plan), quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/?session_id=canceled`,
      allow_promotion_codes: true,
      // Para trial opcional:
      // subscription_data: { trial_period_days: 7 },
    });

    return session;
  }

  /** Verifica session_id após sucesso e materializa dados na Organization */
  async verifyCheckoutSession(sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    if (session.mode !== 'subscription' || session.status !== 'complete') {
      throw new ForbiddenException('payment-not-completed');
    }

    const subscription = session.subscription as Stripe.Subscription;
    const customer = session.customer as Stripe.Customer;

    // 1) Descobrir o price (plano)
    const priceId = subscription.items.data[0]?.price.id;
    let plan: Plan = 'BASIC';
    if (priceId === process.env.STRIPE_PRICE_ADVANCED) plan = 'ADVANCED';
    else if (priceId === process.env.STRIPE_PRICE_PREMIUM) plan = 'PREMIUM';

    // 2) orgId veio no metadata do customer na criação
    const orgId = (customer.metadata as any)?.orgId;
    if (!orgId) throw new BadRequestException('org-metadata-missing');

    // 3) Persistir no banco
    const seatLimit = this.seatLimit(plan);
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        plan,
        seatLimit,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
      },
      select: { id: true, name: true, plan: true, seatLimit: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });

    return { organization: updated };
  }


  /** retorna info de pagamento */
  async getPaymentInfoForOrg(org) {

    // Tenta via invoice_settings.default_payment_method
    const customer = await this.stripe.customers.retrieve(org.stripeCustomerId, {
      expand: ['invoice_settings.default_payment_method'],
    });

    let pm = (customer as any)?.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null;

    // fallback: lista cartões do cliente
    if (!pm) {
      const pms = await this.stripe.paymentMethods.list({
        customer: org.stripeCustomerId,
        type: 'card',
      });
      pm = pms.data?.[0] ?? null;
    }

    const invoices = await this.stripe.invoices.list({ customer: org.stripeCustomerId });

    console.log(invoices)

    const card = pm.card!;
    return {
      defaultPaymentMethod: {
        brand: card.brand,          // 'visa', 'mastercard', ...
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year,
      },
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        amountPaid: inv.amount_paid / 100,
        currency: inv.currency,
        status: inv.status,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
        createdAt: new Date(inv.created * 1000).toISOString(),
      })),
    };
  }

  /** Cria sessão do Stripe Billing Portal para o cliente editar cartão/plano */
  async createBillingPortalSessionForUser(googleId: string) {
    const user = await this.prisma.user.findUnique({
      where: { googleId },
      include: { organization: true },
    });
    if (!user) throw new NotFoundException('user-not-found');
    const org = user.organization;
    if (!org?.stripeCustomerId) {
      throw new BadRequestException('customer-not-found-for-org');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/subscription`, // para onde voltar após editar
      // opcional: configuration: 'bpc_...'  // se você criou uma configuração custom no Stripe
    });

    return { url: session.url };
  }

  async updatePlanForUser(googleId: string, newPlan: Plan) {
    const user = await this.prisma.user.findUnique({
      where: { googleId },
      include: {
        organization: {
        select: {
          id: true,
          plan: true,
          seatLimit: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          users: {
            select: {
              id: true,
            },
            orderBy: { name: 'asc' }
          },
        },
      },
      },
    });

    if (!user?.organization) {
      throw new BadRequestException('organization-not-found');
    }

    const org = user.organization;

    if (!org.stripeSubscriptionId) {
      throw new BadRequestException('organization-has-no-subscription');
    }

    if (org.users.length >= this.seatLimit(newPlan)) {
      throw new ForbiddenException('seat-limit-reached');
    }

    // Recupera a assinatura atual
    const subscription = await this.stripe.subscriptions.retrieve(org.stripeSubscriptionId);

    if (!subscription?.items?.data?.length) {
      throw new NotFoundException('subscription-items-empty');
    }

    const currentItem = subscription.items.data[0];

    // Atualiza o price (Stripe cuida da proration automaticamente)
    const updatedSub = await this.stripe.subscriptions.update(org.stripeSubscriptionId, {
      items: [{
        id: currentItem.id,
        price: this.priceId(newPlan),
      }],
      proration_behavior: 'create_prorations', // gera crédito/débito proporcional
    });

    // 3️⃣ Atualiza o banco
    const updatedOrg = await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        plan: newPlan,
        seatLimit: this.seatLimit(newPlan),
        stripeSubscriptionId: updatedSub.id
      },
    });

    return {
      organization: updatedOrg,
      stripeSubscriptionId: updatedSub.id,
      status: updatedSub.status,
    };
  }
}
