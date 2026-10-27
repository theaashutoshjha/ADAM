// =============================================================
// ADAM-AR v18.0.0 — Real Production Email Dispatch Engine
// =============================================================

import nodemailer from 'nodemailer';
import type { ScorecardRecord } from '../src/types';
import { DEFAULT_SENDER_EMAIL, FATAL_CC_EMAIL } from './fundsindia-directory';

export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
  fromName?: string;
  secure?: boolean;
}

export interface EmailDispatchOptions {
  to: string;
  cc?: string;
  bcc?: string;
  from?: string;
  fromName?: string;
  subject: string;
  scorecards: ScorecardRecord[];
  advisorName?: string;
  smtpConfig?: SmtpConfig;
}

export interface EmailDispatchResult {
  success: boolean;
  messageId?: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
  recipient: string;
  cc?: string;
  smtpResponse?: string;
}

/**
 * Creates a real authenticated Nodemailer SMTP transporter.
 * Supports standard TLS/STARTTLS, Gmail App Passwords, Office365, Amazon SES, SendGrid,
 * and internal corporate unauthenticated relays with proper timeouts.
 */
export function createMailTransporter(config?: SmtpConfig) {
  const host = (config?.host || process.env.SMTP_HOST || '').trim();
  const port = config?.port || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587);
  const user = (config?.user || process.env.SMTP_USER || '').trim();
  const pass = (config?.pass || process.env.SMTP_PASS || '').trim();
  const secure = config?.secure !== undefined ? Boolean(config.secure) : port === 465;

  if (!host) {
    throw new Error(
      'SMTP Host not configured. Please enter your SMTP server host (e.g. smtp.gmail.com, smtp.office365.com) in the Settings page.'
    );
  }

  // Common transporter options with production-grade socket timeouts
  const commonOptions: any = {
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: process.env.SMTP_ALLOW_INSECURE_TLS === 'true' ? false : true,
    },
  };

  // Gmail special optimization
  if (host.includes('gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: user && pass ? { user, pass } : undefined,
      ...commonOptions,
    });
  }

  // Office 365 / Outlook optimization
  if (host.includes('office365.com') || host.includes('outlook.com')) {
    return nodemailer.createTransport({
      host,
      port,
      secure: false, // Office365 uses STARTTLS on port 587
      requireTLS: true,
      auth: user && pass ? { user, pass } : undefined,
      ...commonOptions,
    });
  }

  // Standard SMTP relay (authenticated if user/pass provided, or unauthenticated internal relay)
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    ...commonOptions,
  });
}

/**
 * Tests live connection to the configured SMTP mail server
 */
export async function testSmtpConnection(config?: SmtpConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const user = (config?.user || process.env.SMTP_USER || '').trim();
    const pass = (config?.pass || process.env.SMTP_PASS || '').trim();
    if (!user || !pass) {
      return {
        ok: false,
        message: 'SMTP username/password not entered. Please provide your email and app password in Settings.',
      };
    }
    const transporter = createMailTransporter(config);
    await transporter.verify();
    return { ok: true, message: 'SMTP handshake verified successfully! Mail server is ready to dispatch real emails.' };
  } catch (err: unknown) {
    return { ok: false, message: (err as Error).message || 'Failed to connect to SMTP server.' };
  }
}

/**
 * Escapes HTML characters to prevent HTML/XSS injection in rendered email bodies
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders HTML email template for compliance scorecards in exact Enterprise / SEBI layout
 */
export function renderScorecardEmailHtml(scorecards: ScorecardRecord[], advisorName?: string): string {
  const isBulk = scorecards.length > 1;
  const safeAdvisor = escapeHtml(advisorName || 'Advisor');
  const title = isBulk
    ? `SEBI Regulatory Compliance Audit Batch — ${safeAdvisor} (${scorecards.length} Calls)`
    : `Offline Pre Order Confirmation Call Audit Score Card — ${escapeHtml(scorecards[0]?.client || 'Client')}`;

  const scorecardsHtml = scorecards
    .map((s) => {
      const isFatal = s.is_fatal || s.q1_status === 'FAIL' || s.q2_status === 'FAIL' || s.q5_status === 'FAIL' || s.score === 0;
      const stars = isFatal ? '*' : '*'.repeat(s.score || 0);

      const caller = escapeHtml(s.caller_name || '—');
      const team = escapeHtml(s.team || '—');
      const client = escapeHtml(s.client || '—');
      const phone = escapeHtml(s.trade_phone || s.calling_number || '—');
      const tradeDate = escapeHtml(s.trade_date || s.call_date || '—');
      const auditDate = escapeHtml(s.created_at ? s.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
      const q1Evidence = s.q1_evidence ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 4px;">Quote: &ldquo;${escapeHtml(s.q1_evidence)}&rdquo;</div>` : '';
      const q2Evidence = s.q2_evidence ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 4px;">Quote: &ldquo;${escapeHtml(s.q2_evidence)}&rdquo;</div>` : '';
      const q3Evidence = s.q3_evidence ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 4px;">Quote: &ldquo;${escapeHtml(s.q3_evidence)}&rdquo;</div>` : '';
      const q4Evidence = s.q4_evidence ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 4px;">Quote: &ldquo;${escapeHtml(s.q4_evidence)}&rdquo;</div>` : '';
      const q5Evidence = s.q5_evidence ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 4px;">Quote: &ldquo;${escapeHtml(s.q5_evidence)}&rdquo;</div>` : '';
      const auditComment = escapeHtml(s.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.');

      return `
    <div style="margin-bottom: 32px; border: 1px solid #94a3b8; border-radius: 8px; overflow: hidden; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <!-- Card Blue Header Title -->
      <div style="background-color: #1e3a8a; color: #ffffff; font-weight: bold; text-align: center; padding: 10px 16px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
        Offline Pre Order Confirmation Call Audit Score Card
      </div>

      <div style="padding: 16px;">
        <!-- Metadata 2x4 Grid -->
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #94a3b8; font-size: 12px; margin-bottom: 16px;">
          <tr>
            <th style="border: 1px solid #94a3b8; background-color: #e2e8f0; padding: 6px 10px; text-align: left; width: 25%; color: #1e293b;">Caller Name</th>
            <td style="border: 1px solid #94a3b8; background-color: #f8fafc; padding: 6px 10px; width: 25%; color: #0f172a; font-weight: 500;">${caller}</td>
            <th style="border: 1px solid #94a3b8; background-color: #e2e8f0; padding: 6px 10px; text-align: left; width: 25%; color: #1e293b;">Team</th>
            <td style="border: 1px solid #94a3b8; background-color: #f8fafc; padding: 6px 10px; width: 25%; color: #0f172a; font-weight: 500;">${team}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #94a3b8; background-color: #e2e8f0; padding: 6px 10px; text-align: left; color: #1e293b;">Client ID</th>
            <td style="border: 1px solid #94a3b8; background-color: #f8fafc; padding: 6px 10px; color: #0f172a; font-weight: bold; font-family: monospace;">${client}</td>
            <th style="border: 1px solid #94a3b8; background-color: #e2e8f0; padding: 6px 10px; text-align: left; color: #1e293b;">Phone Number</th>
            <td style="border: 1px solid #94a3b8; background-color: #f8fafc; padding: 6px 10px; color: #0f172a; font-family: monospace;">${phone}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #94a3b8; background-color: #e2e8f0; padding: 6px 10px; text-align: left; color: #1e293b;">Trade Date</th>
            <td style="border: 1px solid #94a3b8; background-color: #f8fafc; padding: 6px 10px; color: #0f172a;">${tradeDate}</td>
            <th style="border: 1px solid #94a3b8; background-color: #e2e8f0; padding: 6px 10px; text-align: left; color: #1e293b;">Audit Date</th>
            <td style="border: 1px solid #94a3b8; background-color: #f8fafc; padding: 6px 10px; color: #0f172a;">${auditDate}</td>
          </tr>
        </table>

        <!-- 5-Parameter Evaluation Table -->
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #94a3b8; font-size: 12px; margin-bottom: 16px;">
          <thead>
            <tr style="background-color: #1e3a8a; color: #ffffff; text-align: center;">
              <th style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: left; width: 60%;">PARAMETERS</th>
              <th style="border: 1px solid #94a3b8; padding: 8px 10px; width: 12%;">Mark</th>
              <th style="border: 1px solid #94a3b8; padding: 8px 10px; width: 14%;">Flag</th>
              <th style="border: 1px solid #94a3b8; padding: 8px 10px; width: 14%;">Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; color: #b91c1c; font-weight: 500;">
                Confirmation given in the Customer's Registered / authorised Number ?
                ${q1Evidence}
              </td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold;">${s.q1_status === 'PASS' ? '1' : '0'}</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; color: #dc2626; font-weight: bold;">FATAL</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold; color: ${s.q1_status === 'PASS' ? '#15803d' : '#b91c1c'};">${s.q1_status === 'PASS' ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; color: #b91c1c; font-weight: 500;">
                Was the client code explicitly confirmed before the order?
                ${q2Evidence}
              </td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold;">${s.q2_status === 'PASS' ? '1' : '0'}</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; color: #dc2626; font-weight: bold;">FATAL</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold; color: ${s.q2_status === 'PASS' ? '#15803d' : '#b91c1c'};">${s.q2_status === 'PASS' ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; color: #1e293b;">
                Were stock name, price and quantity explicitly confirmed before the order?
                ${q3Evidence}
              </td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold;">${s.q3_status === 'PASS' ? '1' : '0'}</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center;"></td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold; color: ${s.q3_status === 'PASS' ? '#15803d' : '#b91c1c'};">${s.q3_status === 'PASS' ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; color: #1e293b;">
                Customer Acknowledge the same?
                ${q4Evidence}
              </td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold;">${s.q4_status === 'PASS' ? '1' : '0'}</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center;"></td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold; color: ${s.q4_status === 'PASS' ? '#15803d' : '#b91c1c'};">${s.q4_status === 'PASS' ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; color: #b91c1c; font-weight: 500;">
                Wasn't there any Return Commitment ?
                ${q5Evidence}
              </td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold;">${s.q5_status === 'PASS' ? '1' : '0'}</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; color: #dc2626; font-weight: bold;">FATAL</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-weight: bold; color: ${s.q5_status === 'PASS' ? '#15803d' : '#b91c1c'};">${s.q5_status === 'PASS' ? 'Yes' : 'No'}</td>
            </tr>
            <!-- Total Row -->
            <tr style="background-color: #f0fdfa; font-weight: bold; color: #0f172a; border-top: 2px solid #0d9488;">
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: right; color: #0f766e;">TOTAL</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-size: 14px;">5</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-size: 16px; color: #0f766e;">${stars}</td>
              <td style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; font-size: 16px; color: #0f766e;">${s.score !== null ? s.score : 'Pending'}</td>
            </tr>
          </tbody>
        </table>

        <!-- Comment Box -->
        <div style="border: 1px solid #94a3b8; background-color: #f8fafc; padding: 12px; font-size: 12px; color: #1e293b; line-height: 1.5;">
          <strong>Comment about the call:</strong> ${auditComment}
        </div>
      </div>
    </div>`;
    })
    .join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 24px; margin: 0;">
    <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <div style="border-bottom: 2px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0 0 6px 0; color: #0f172a; font-size: 20px;">Enterprise Compliance & Quality Assurance • AuditEQ Quality & Compliance Intelligence</h1>
        <p style="margin: 0; color: #64748b; font-size: 13px;">SEBI Regulatory Offline Pre-Order Call Audit Scorecard Summary</p>
      </div>

      ${scorecardsHtml}

      <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center;">
        ADAM-AR Enterprise Quality &amp; Compliance Assurance Engine
      </div>
    </div>
  </body>
  </html>
  `;
}

/**
 * Dispatches an email containing one or multiple compliance scorecards using Nodemailer.
 * Dispatches REAL email across the internet to real inboxes.
 */
export async function sendScorecardEmail(options: EmailDispatchOptions): Promise<EmailDispatchResult> {
  const { to, cc, bcc, from, fromName, subject, scorecards, advisorName, smtpConfig } = options;

  if (!to || !to.includes('@')) {
    return {
      success: false,
      status: 'failed',
      errorMessage: `Invalid recipient email address: "${to}"`,
      recipient: to || 'undefined',
    };
  }

  // Detect whether any scorecard in this batch is marked FATAL
  const isFatalScorecard = (s: ScorecardRecord) =>
    Boolean(s.is_fatal) || s.score === 0 || s.q1_status === 'FAIL' || s.q2_status === 'FAIL' || s.q5_status === 'FAIL';

  const isFatalAlone = scorecards.length > 0 && scorecards.every(isFatalScorecard);

  const ccSet = new Set<string>();
  if (cc && cc.trim()) {
    cc.split(/[,;]/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .forEach((e) => ccSet.add(e));
  }

  // Only add Sambath S when sending fatals alone/only fatals (0 marks)
  if (isFatalAlone) {
    ccSet.add(FATAL_CC_EMAIL.toLowerCase());
  } else {
    ccSet.delete(FATAL_CC_EMAIL.toLowerCase());
    ccSet.delete('sambath.s@fundsindia.com');
  }

  const finalCcString = Array.from(ccSet).join(', ');

  let transporter;
  const user = (smtpConfig?.user || process.env.SMTP_USER || '').trim();
  const pass = (smtpConfig?.pass || process.env.SMTP_PASS || '').trim();
  const host = (smtpConfig?.host || process.env.SMTP_HOST || '').trim();

  // If SMTP credentials are not configured, fail explicitly with actionable message rather than reporting a false success
  if (!user || !pass || !host) {
    const previewMessageId = `<preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@adam-ar.internal>`;
    console.warn(`[EmailService] SMTP credentials unconfigured. Email to ${to} rejected with actionable notification.`);
    return {
      success: false,
      status: 'failed',
      messageId: previewMessageId,
      recipient: to,
      cc: finalCcString,
      errorMessage: 'SMTP host, username, or password unconfigured. Please configure live SMTP settings in Settings page to dispatch regulatory emails.',
      smtpResponse: 'Undelivered: Missing SMTP configuration in environment or Settings.',
    };
  }

  try {
    transporter = createMailTransporter(smtpConfig);
  } catch (err: unknown) {
    return {
      success: false,
      status: 'failed',
      errorMessage: (err as Error).message,
      recipient: to,
      cc: finalCcString,
    };
  }

  const senderAddress = from || smtpConfig?.from || smtpConfig?.user || DEFAULT_SENDER_EMAIL;
  const senderDisplayName = fromName || smtpConfig?.fromName || 'ADAM-AR Compliance';
  const htmlContent = renderScorecardEmailHtml(scorecards, advisorName);

  try {
    const info = await transporter.sendMail({
      from: `"${senderDisplayName}" <${senderAddress}>`,
      to,
      cc: finalCcString || undefined,
      bcc: bcc || undefined,
      subject,
      html: htmlContent,
    });

    return {
      success: true,
      status: 'sent',
      messageId: info.messageId,
      recipient: to,
      cc: finalCcString,
      smtpResponse: info.response,
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      success: false,
      status: 'failed',
      errorMessage: err.message || 'Unknown email dispatch error',
      recipient: to,
      cc: finalCcString,
    };
  }
}

export interface TradeConfirmationOptions {
  callId: number;
  recordingName?: string;
  callerName?: string;
  clientCode?: string;
  callingNumber?: string;
  registeredNumber?: string;
  callDate?: string;
  transcriptSnippet?: string;
  candidateTrades?: any[];
  recipientEmail?: string;
  smtpConfig?: SmtpConfig;
}

export interface TradeConfirmationResult {
  success: boolean;
  status: 'sent' | 'failed' | 'logged';
  messageId?: string;
  errorMessage?: string;
}

/**
 * Renders HTML template for Missing / Unresolved Trade Confirmation
 */
export function renderTradeConfirmationEmailHtml(options: TradeConfirmationOptions): string {
  const {
    callId,
    recordingName = 'Unknown Recording',
    callerName = 'Unassigned Advisor',
    clientCode = 'Unknown UCC',
    callingNumber = 'Unknown',
    registeredNumber = 'Unknown',
    callDate = new Date().toISOString().slice(0, 10),
    transcriptSnippet = '',
    candidateTrades = [],
  } = options;

  const candidateRows =
    candidateTrades.length > 0
      ? candidateTrades
          .map(
            (c: any, i: number) => `
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">#${i + 1} (${c.trade?.external_id || c.trade?.id || 'Trade'})</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">${c.trade?.symbol || '—'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">${c.trade?.quantity || '—'} @ ₹${c.trade?.price || 'CMP'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">${((c.score || 0) * 100).toFixed(0)}% (${(c.reasons || []).join(', ') || 'Partial match'})</td>
        </tr>
      `
          )
          .join('')
      : `<tr><td colspan="4" style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #64748b;">No correlated trade candidates found in trade book.</td></tr>`;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Action Required: Missing Trade Confirmation</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 20px; margin: 0;">
    <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; overflow: hidden;">
      <div style="background-color: #b45309; color: #ffffff; padding: 14px 20px; font-weight: bold; font-size: 15px;">
        ⚠️ Action Required: Pre-Order Call Missing Exact Trade Confirmation
      </div>
      <div style="padding: 20px;">
        <p style="font-size: 13px; color: #334155; margin-top: 0;">
          The ADAM-AR Automated Compliance Engine identified actionable <b>PRE-ORDER</b> intent in Call <b>#${callId}</b>, but <b>could not find a verified, conclusive trade match</b> in the trade book repository. Per SEBI regulatory guidelines, pre-order compliance audits are paused until this trade is confirmed.
        </p>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px;">
          <tr>
            <th style="border: 1px solid #cbd5e1; background-color: #f1f5f9; padding: 6px 10px; text-align: left; width: 35%;">Call ID / File</th>
            <td style="border: 1px solid #cbd5e1; padding: 6px 10px;">Call #${callId} (${recordingName})</td>
          </tr>
          <tr>
            <th style="border: 1px solid #cbd5e1; background-color: #f1f5f9; padding: 6px 10px; text-align: left;">Advisor / Caller</th>
            <td style="border: 1px solid #cbd5e1; padding: 6px 10px; font-weight: bold;">${callerName}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #cbd5e1; background-color: #f1f5f9; padding: 6px 10px; text-align: left;">Client UCC / Phone</th>
            <td style="border: 1px solid #cbd5e1; padding: 6px 10px; font-family: monospace;">${clientCode} / CLI: ${callingNumber} (Reg: ${registeredNumber})</td>
          </tr>
          <tr>
            <th style="border: 1px solid #cbd5e1; background-color: #f1f5f9; padding: 6px 10px; text-align: left;">Date of Call</th>
            <td style="border: 1px solid #cbd5e1; padding: 6px 10px;">${callDate}</td>
          </tr>
        </table>

        ${
          transcriptSnippet
            ? `<div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 10px; border-radius: 6px; font-size: 12px; color: #92400e; margin-bottom: 16px;">
          <strong>Relevant Dialogue Snippet:</strong><br/>
          <em>"${transcriptSnippet}"</em>
        </div>`
            : ''
        }

        <h4 style="font-size: 13px; color: #1e293b; margin-bottom: 6px;">Close / Ambiguous Candidates Evaluated:</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="border: 1px solid #cbd5e1; padding: 6px 8px;">Trade Ref</th>
              <th style="border: 1px solid #cbd5e1; padding: 6px 8px;">Symbol</th>
              <th style="border: 1px solid #cbd5e1; padding: 6px 8px;">Qty &amp; Price</th>
              <th style="border: 1px solid #cbd5e1; padding: 6px 8px;">Match Status</th>
            </tr>
          </thead>
          <tbody>
            ${candidateRows}
          </tbody>
        </table>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-size: 11px; color: #64748b;">
          <strong>Resolution Instructions:</strong><br/>
          1. If the trade was executed under a different UCC or terminal, please perform manual trade correlation in the ADAM-AR dashboard.<br/>
          2. If the order was cancelled or never punched, verify the order cancellation record.<br/>
          3. Unresolved trades will remain in <code>REVIEW / PENDING_CONFIRMATION</code> to avoid false audit penalties.
        </div>
      </div>
      <div style="background-color: #f1f5f9; padding: 10px 20px; font-size: 11px; color: #94a3b8; text-align: center;">
        ADAM-AR Compliance Assurance • Regulatory Pre-Order Intelligence
      </div>
    </div>
  </body>
  </html>
  `;
}

/**
 * Dispatches trade confirmation request email when a pre-order call has no exact trade match.
 */
export async function CALL_MAIL_CONFIRMATION(options: TradeConfirmationOptions): Promise<TradeConfirmationResult> {
  const recipient = options.recipientEmail || process.env.COMPLIANCE_HEAD_EMAIL || DEFAULT_SENDER_EMAIL;
  const html = renderTradeConfirmationEmailHtml(options);
  const subject = `[ACTION REQUIRED] Missing Trade Confirmation for Pre-Order Call #${options.callId} (${options.callerName || 'Advisor'})`;

  try {
    const transporter = createMailTransporter(options.smtpConfig);
    const from = options.smtpConfig?.from || options.smtpConfig?.user || DEFAULT_SENDER_EMAIL;
    const info = await transporter.sendMail({
      from: `"ADAM-AR Compliance" <${from}>`,
      to: recipient,
      cc: FATAL_CC_EMAIL,
      subject,
      html,
    });

    return {
      success: true,
      status: 'sent',
      messageId: info.messageId,
    };
  } catch (err: any) {
    // If SMTP is unconfigured, return logged status so pipeline continues smoothly
    return {
      success: false,
      status: 'logged',
      errorMessage: err.message || 'SMTP not configured or failed to deliver.',
    };
  }
}
