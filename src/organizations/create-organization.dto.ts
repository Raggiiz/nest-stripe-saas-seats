import { IsEnum, IsNumber, IsString, MinLength } from 'class-validator';

export enum PlanDto {
  BASIC_MONTH = 'BASIC_MONTH',
  BASIC_YEAR = 'BASIC_YEAR',
  ADVANCED_MONTH = 'ADVANCED_MONTH',
  ADVANCED_YEAR = 'ADVANCED_YEAR',
  PREMIUM_MONTH = 'PREMIUM_MONTH',
  PREMIUM_YEAR = 'PREMIUM_YEAR',
}

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(PlanDto)
  plan: PlanDto;

  @IsNumber()
  seats: number
}
