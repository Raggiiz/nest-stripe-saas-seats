import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { Organization, Plan } from '@prisma/client';

@Injectable()
export class BillingService {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  constructor(private prisma: PrismaService) { }

  private priceId(plan: Plan) {
    switch (plan) {
      case 'ADVANCED_MONTH': return process.env.STRIPE_PRICE_ADVANCED_MONTH!;
      case 'ADVANCED_YEAR': return process.env.STRIPE_PRICE_ADVANCED_YEAR!;
      case 'PREMIUM_MONTH': return process.env.STRIPE_PRICE_PREMIUM_MONTH!;
      case 'PREMIUM_YEAR': return process.env.STRIPE_PRICE_PREMIUM_YEAR!;
      case 'BASIC_YEAR': return process.env.STRIPE_PRICE_BASIC_YEAR!;
      default: return process.env.STRIPE_PRICE_BASIC_MONTH!;
    }
  }


  /** Cria (ou reaproveita) Customer, cria org se não houver, e retorna a URL da Checkout Session */
  async createCheckoutSessionForUser(
    email: string,
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
      line_items: [{ price: this.priceId(org.plan), quantity: org.seatLimit }],
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
    let plan: Plan = 'BASIC_MONTH';
    if (priceId === this.priceId('BASIC_YEAR')) plan = 'BASIC_YEAR';
    else if (priceId === this.priceId('ADVANCED_MONTH')) plan = 'ADVANCED_MONTH';
    else if (priceId === this.priceId('ADVANCED_YEAR')) plan = 'ADVANCED_YEAR';
    else if (priceId === this.priceId('PREMIUM_MONTH')) plan = 'PREMIUM_MONTH';
    else if (priceId === this.priceId('PREMIUM_YEAR')) plan = 'PREMIUM_YEAR';

    // 2) orgId veio no metadata do customer na criação
    const orgId = (customer.metadata as any)?.orgId;
    if (!orgId) throw new BadRequestException('org-metadata-missing');

    // 3) Descobrir seats
    const seatLimit = subscription.items[0]?.quantity

    // 3) Persistir no banco
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

  async updateSubscriptionForOrg(googleId: string, newPlan?: Plan, seats?: number) {
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

    // Recupera a assinatura atual
    const subscription = await this.stripe.subscriptions.retrieve(org.stripeSubscriptionId);

    if (!subscription?.items?.data?.length) {
      throw new NotFoundException('subscription-items-empty');
    }

    const currentItem = subscription.items.data[0];

    // Valida seats (quantity) se vier
    let nextQuantity = seats ?? currentItem.quantity ?? 1;
    if (nextQuantity < 1) throw new BadRequestException('quantity-min-1');

    // Novo plano
    const newPriceId = newPlan ? this.priceId(newPlan) : undefined;

    const activeUsers = await this.prisma.user.count({ where: { organizationId: org.id } });
    if (nextQuantity < activeUsers) {
      throw new BadRequestException(`quantity-too-low (current users: ${activeUsers})`);
    }

    // Atualiza o price (Stripe cuida da proration automaticamente)
    const updatedSub = await this.stripe.subscriptions.update(org.stripeSubscriptionId, {
      items: [{
        id: currentItem.id,
        ...(newPriceId ? { price: newPriceId } : {}),
        ...(nextQuantity ? { quantity: nextQuantity } : {}),
      }],
      proration_behavior: 'create_prorations', // gera crédito/débito proporcional
    });

    const updatedItem = updatedSub.items.data[0];
    // Atualiza o banco
    const updatedOrg = await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        plan: newPlan,
        seatLimit: updatedItem.quantity ?? nextQuantity,
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
