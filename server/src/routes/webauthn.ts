import { Router } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const rpName = 'Capsule Demo';
const rpID = 'localhost';
const origin = 'http://localhost:3000';

const user = {
  id: new Uint8Array(Buffer.from('demo_user_id', 'utf-8')),
  username: 'demo_user',
};

// In-memory store
export let storedCredential: {
  id: string;
  publicKey: Uint8Array;
  counter: number;
} | null = null;

let currentChallenge = '';

export const webauthnRouter = Router();

webauthnRouter.post('/generate-registration-options', async (req, res) => {
  try {
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: user.id,
      userName: user.username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'discouraged',
        userVerification: 'preferred',
      },
    });

    currentChallenge = options.challenge;
    res.json(options);
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

webauthnRouter.post('/verify-registration', async (req, res) => {
  const { body } = req;

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      storedCredential = {
        id: verification.registrationInfo.credential.id,
        publicKey: verification.registrationInfo.credential.publicKey,
        counter: verification.registrationInfo.credential.counter,
      };
      return res.json({ verified: true, credentialId: storedCredential.id });
    }
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error.message });
  }

  res.status(400).json({ verified: false });
});

webauthnRouter.post('/generate-authentication-options', async (req, res) => {
  if (!storedCredential) {
    return res.status(400).json({ error: 'No credential registered' });
  }

  try {
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [{
        id: storedCredential.id,
      }],
      userVerification: 'preferred',
    });

    currentChallenge = options.challenge;
    res.json(options);
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

webauthnRouter.post('/verify-authentication', async (req, res) => {
  const { body } = req;

  if (!storedCredential) {
    return res.status(400).json({ error: 'No credential registered' });
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: storedCredential.id,
        publicKey: storedCredential.publicKey as any,
        counter: storedCredential.counter,
      },
    });

    if (verification.verified) {
      storedCredential.counter = verification.authenticationInfo.newCounter;
      return res.json({ verified: true, credentialId: storedCredential.id });
    }
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error.message });
  }

  res.status(400).json({ verified: false });
});

webauthnRouter.get('/status', (req, res) => {
  res.json({ isRegistered: storedCredential !== null });
});
