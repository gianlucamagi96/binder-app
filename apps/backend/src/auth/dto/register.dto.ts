import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email non valida' })
  email: string;

  @IsString()
  @MinLength(3, { message: 'Username troppo corto (minimo 3 caratteri)' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Username può contenere solo lettere, numeri, . _ -',
  })
  username: string;

  @IsString()
  @MinLength(8, { message: 'La password deve avere almeno 8 caratteri' })
  password: string;
}
