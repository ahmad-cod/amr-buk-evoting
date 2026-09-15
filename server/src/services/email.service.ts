import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface DevVerificationEmail {
  to: string;
  fullName: string;
  token: string;
  link: string;
  sentAt: Date;
}

export interface DevRecoveryEmail {
  to: string;
  fullName: string;
  token: string;
  link: string;
  sentAt: Date;
}

const devEmails: DevVerificationEmail[] = [];
const devRecoveryEmails: DevRecoveryEmail[] = [];

export function getDevVerificationEmails(): DevVerificationEmail[] {
  return [...devEmails];
}

export function getLastDevVerificationEmail(): DevVerificationEmail | undefined {
  return devEmails[devEmails.length - 1];
}

export function clearDevVerificationEmails(): void {
  devEmails.length = 0;
}

export function getDevRecoveryEmails(): DevRecoveryEmail[] {
  return [...devRecoveryEmails];
}

export function getLastDevRecoveryEmail(): DevRecoveryEmail | undefined {
  return devRecoveryEmails[devRecoveryEmails.length - 1];
}

export function clearDevRecoveryEmails(): void {
  devRecoveryEmails.length = 0;
}

/**
 * Builds the responsive, branded HTML email template for AMR Club BUK voter verification.
 */
function buildVerificationEmailHtml(
  fullName: string,
  verificationLink: string,
  expiresMinutes: number,
  electionTitle = 'AMR Club BUK General Election',
): string {
  const expiryText =
    expiresMinutes >= 60
      ? `${Math.round(expiresMinutes / 60)} hour(s)`
      : `${expiresMinutes} minutes`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Official Voter Verification — ${electionTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 0; color: #1E293B; }
    .container { max-width: 560px; margin: 30px auto; background-color: #FFFFFF; border-radius: 8px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background-color: #1B3A6B; padding: 28px 32px; text-align: center; }
    .header h1 { color: #FFFFFF; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { color: #4FB3C9; margin: 6px 0 0 0; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; }
    .content { padding: 32px; }
    .greeting { font-size: 16px; font-weight: 600; color: #0F172A; margin-bottom: 12px; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { display: inline-block; background-color: #1B3A6B; color: #FFFFFF !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px; border: 1px solid #142c52; }
    .warning-box { background-color: #E3F2FA; border-left: 4px solid #4FB3C9; padding: 12px 16px; margin: 24px 0; border-radius: 4px; font-size: 13px; color: #1B3A6B; }
    .fallback { margin-top: 24px; padding-top: 20px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; word-break: break-all; }
    .fallback a { color: #1B3A6B; }
    .footer { background-color: #F1F5F9; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748B; line-height: 1.5; border-top: 1px solid #E2E8F0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AMR CLUB BUK</h1>
      <p>Independent Electoral Committee (AMR IEC)</p>
    </div>
    <div class="content">
      <div class="greeting">Hello ${fullName},</div>
      <div class="message">
        You are receiving this official verification email because your email address is on the approved accredited voter register for the <strong>${electionTitle}</strong> (AMR Club, Bayero University Kano).
      </div>
      <div class="message">
        To verify your email ownership and access your secure, authenticated voting session, please click the button below:
      </div>
      <div class="button-container">
        <a href="${verificationLink}" class="button" target="_blank">Verify Email &amp; Access Ballot</a>
      </div>
      <div class="warning-box">
        <strong>Important Security Notice:</strong> This verification link is single-use and will expire in <strong>${expiryText}</strong>. It cannot be shared or used more than once. Voting is anonymous and protected by cryptographic ballot receipts.
      </div>
      <div class="fallback">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${verificationLink}">${verificationLink}</a>
      </div>
    </div>
    <div class="footer">
      This is an official automated transmission from the Antimicrobial Resistance Independent Electoral Committee (AMR IEC), Bayero University Kano.<br>
      If you did not expect this message or are not an AMR Club member, please disregard it. Nobody can access your vote without this single-use link.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends or simulates the dispatch of an account verification email.
 */
export async function sendVerificationEmail(
  to: string,
  fullName: string,
  rawToken: string,
  electionTitle = 'AMR Club BUK General Election',
): Promise<{ success: boolean; simulated: boolean; error?: string }> {
  const verificationLink = `${env.CLIENT_URL}/verify?token=${rawToken}`;
  const expiresMinutes = env.VERIFICATION_TOKEN_EXPIRES_MINUTES || 30;

  // 1. Non-production / Simulated Mode
  if (!env.isProd && !env.SEND_REAL_EMAILS) {
    const record: DevVerificationEmail = {
      to,
      fullName,
      token: rawToken,
      link: verificationLink,
      sentAt: new Date(),
    };
    devEmails.push(record);

    logger.info(`[DEV EMAIL] Verification Link: ${verificationLink}`);
    logger.info(`[DEV EMAIL] Target Voter: ${fullName} <${to}> (${electionTitle})`);
    return { success: true, simulated: true };
  }

  // 2. Production or Explicit Live Sending Mode (via Resend)
  if (!env.RESEND_API_KEY) {
    logger.error('Cannot send verification email: RESEND_API_KEY is not configured in production.');
    throw new Error('Email service configuration missing. Please contact the administrator.');
  }

  try {
    const htmlContent = buildVerificationEmailHtml(fullName, verificationLink, expiresMinutes, electionTitle);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: `Official Voter Verification — ${electionTitle}`,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error(`Resend API error (${response.status}): ${errBody}`);
      return { success: false, simulated: false, error: errBody };
    }

    const data = await response.json();
    logger.info(`Verification email sent via Resend to ${to} (id: ${(data as any).id})`);
    return { success: true, simulated: false };
  } catch (error: any) {
    logger.error('Failed to send verification email via Resend:', error);
    return { success: false, simulated: false, error: error.message };
  }
}

/**
 * Builds the responsive, branded HTML email template for AMR Club BUK password recovery.
 */
function buildPasswordRecoveryEmailHtml(
  fullName: string,
  recoveryLink: string,
  expiresMinutes = 30,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your AMR BUK Election password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 0; color: #1E293B; }
    .container { max-width: 560px; margin: 30px auto; background-color: #FFFFFF; border-radius: 8px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background-color: #1B3A6B; padding: 28px 32px; text-align: center; }
    .header h1 { color: #FFFFFF; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { color: #4FB3C9; margin: 6px 0 0 0; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; }
    .content { padding: 32px; }
    .greeting { font-size: 16px; font-weight: 600; color: #0F172A; margin-bottom: 12px; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { display: inline-block; background-color: #1B3A6B; color: #FFFFFF !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px; border: 1px solid #142c52; }
    .warning-box { background-color: #E3F2FA; border-left: 4px solid #4FB3C9; padding: 12px 16px; margin: 24px 0; border-radius: 4px; font-size: 13px; color: #1B3A6B; }
    .fallback { margin-top: 24px; padding-top: 20px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; word-break: break-all; }
    .fallback a { color: #1B3A6B; }
    .footer { background-color: #F1F5F9; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748B; line-height: 1.5; border-top: 1px solid #E2E8F0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AMR CLUB BUK</h1>
      <p>Independent Electoral Committee (AMR IEC)</p>
    </div>
    <div class="content">
      <div class="greeting">Hello ${fullName},</div>
      <div class="message">
        We received a request to set or reset the password for your AMR Club BUK Election account.
      </div>
      <div class="message">
        Click the button below to set a new password. This single form works for both first-time password setup and password resets:
      </div>
      <div class="button-container">
        <a href="${recoveryLink}" class="button" target="_blank">Set a New Password</a>
      </div>
      <div class="warning-box">
        <strong>Important Security Notice:</strong> This recovery link is single-use and will expire in <strong>${expiresMinutes} minutes</strong>. If you did not request this recovery link, please ignore this email. Your account credentials and voting records remain completely secure.
      </div>
      <div class="fallback">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${recoveryLink}">${recoveryLink}</a>
      </div>
    </div>
    <div class="footer">
      This is an official automated transmission from the Antimicrobial Resistance Independent Electoral Committee (AMR IEC), Bayero University Kano.<br>
      No password, voter ID, or ballot information is included in this message.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends or simulates the dispatch of a password recovery email.
 */
export async function sendPasswordRecoveryEmail(
  to: string,
  fullName: string,
  rawToken: string,
): Promise<{ success: boolean; simulated: boolean; error?: string }> {
  const recoveryLink = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;
  const expiresMinutes = 30;

  // 1. Non-production / Simulated Mode
  if (!env.isProd && !env.SEND_REAL_EMAILS) {
    const record: DevRecoveryEmail = {
      to,
      fullName,
      token: rawToken,
      link: recoveryLink,
      sentAt: new Date(),
    };
    devRecoveryEmails.push(record);

    logger.info(`[DEV EMAIL] Password Recovery Link: ${recoveryLink}`);
    logger.info(`[DEV EMAIL] Target Voter: ${fullName} <${to}>`);
    return { success: true, simulated: true };
  }

  // 2. Production or Explicit Live Sending Mode (via Resend)
  if (!env.RESEND_API_KEY) {
    logger.error('Cannot send password recovery email: RESEND_API_KEY is not configured in production.');
    throw new Error('Email service configuration missing. Please contact the administrator.');
  }

  try {
    const htmlContent = buildPasswordRecoveryEmailHtml(fullName, recoveryLink, expiresMinutes);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: 'Reset your AMR BUK Election password',
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error(`Resend API error (${response.status}): ${errBody}`);
      return { success: false, simulated: false, error: errBody };
    }

    const data = await response.json();
    logger.info(`Password recovery email sent via Resend to ${to} (id: ${(data as any).id})`);
    return { success: true, simulated: false };
  } catch (error: any) {
    logger.error('Failed to send password recovery email via Resend:', error);
    return { success: false, simulated: false, error: error.message };
  }
}

