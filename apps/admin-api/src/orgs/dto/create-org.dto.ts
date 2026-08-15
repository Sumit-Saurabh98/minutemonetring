import { IsString, Length } from "class-validator";

export class CreateOrgDto {
  @IsString()
  @Length(2, 60)
  name!: string;
}
