import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      // Fallback "not-configured" per permettere all'app di avviarsi anche
      // prima di aver impostato le credenziali Google reali in .env.
      // Le rotte /auth/google restano non funzionanti finché non vengono valorizzate.
      clientID: process.env.GOOGLE_CLIENT_ID || 'not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'not-configured',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ??
        'http://localhost:3001/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    const avatarUrl = profile.photos?.[0]?.value ?? null;

    if (!email) {
      return done(new Error('Google non ha restituito un indirizzo email'), false);
    }

    const user = await this.authService.validateGoogleUser({
      googleId: profile.id,
      email,
      displayName: profile.displayName,
      avatarUrl,
    });

    done(null, user);
  }
}
