import { IsEnum, IsString, MinLength } from 'class-validator';

export enum PlanDto {
  BASIC = 'BASIC',
  ADVANCED = 'ADVANCED',
  PREMIUM = 'PREMIUM',
}

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(PlanDto)
  plan: PlanDto;
}
