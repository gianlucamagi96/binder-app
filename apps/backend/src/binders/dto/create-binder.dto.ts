import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const BINDER_TYPES = ['GAME', 'EXPANSION', 'FREE', 'ARTIST'] as const;
export type BinderTypeInput = (typeof BINDER_TYPES)[number];

export class CreateBinderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsIn(BINDER_TYPES)
  type: BinderTypeInput;

  @ValidateIf((dto: CreateBinderDto) => dto.type === 'GAME')
  @IsString()
  @MinLength(1, { message: 'tcgGameCode è richiesto per i binder di tipo GAME' })
  tcgGameCode?: string;

  @ValidateIf((dto: CreateBinderDto) => dto.type === 'EXPANSION')
  @IsArray()
  @ArrayMinSize(1, { message: 'Seleziona almeno una espansione' })
  @IsString({ each: true })
  expansionIds?: string[];

  @ValidateIf((dto: CreateBinderDto) => dto.type === 'ARTIST')
  @IsString()
  @MinLength(1, { message: 'Seleziona un artista' })
  @MaxLength(120)
  artistName?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  rows: number;

  @IsInt()
  @Min(1)
  @Max(10)
  cols: number;

  @IsOptional()
  @IsString()
  coverStyle?: string;
}
