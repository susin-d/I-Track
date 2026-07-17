import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../config/env.js";

type MailRecipient = { name?: string; email: string };
type UserMailRecipient = { name: string; email: string };

export type MailMessage = { subject: string; text: string; html: string };

export type LoginMailDetails = {
  ipAddress?: string;
  userAgent?: string;
  loggedInAt?: Date;
};

export type InvitationMailDetails = {
  recipient: MailRecipient;
  organizationName: string;
  invitedBy: string;
  role: string;
  inviteUrl: string;
  otp: string;
  expiresAt: Date;
};

export type OtpMailDetails = {
  purpose: "registration" | "login";
  otp: string;
  expiresInMinutes?: number;
};

let transporter: Transporter | undefined;
let warnedAboutMissingConfiguration = false;

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const formatRole = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);
const formatDate = (date: Date) => date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
const appUrl = () => env.appUrl.replace(/\/+$/, "");

function configuredSmtp() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPassword && env.smtpFrom);
}

function getTransporter() {
  if (!configuredSmtp()) {
    if (!warnedAboutMissingConfiguration) {
      warnedAboutMissingConfiguration = true;
      console.warn("[mail] SMTP is not configured; transactional emails will be skipped");
    }
    return undefined;
  }
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPassword },
  });
  return transporter;
}

async function sendTransactionalMail(recipient: MailRecipient, message: MailMessage) {
  const mailer = getTransporter();
  if (!mailer) return false;

  try {
    await mailer.sendMail({
      from: env.smtpFromName ? { name: env.smtpFromName, address: env.smtpFrom! } : env.smtpFrom,
      to: recipient.name ? { name: recipient.name, address: recipient.email } : recipient.email,
      ...message,
    });
    return true;
  } catch (error) {
    console.error("[mail] SMTP delivery failed", error instanceof Error ? error.message : error);
    return false;
  }
}

function htmlLayout(title: string, intro: string, body: string, button?: { label: string; url: string }) {
  const action = button
    ? `<p style="margin:28px 0"><a href="${escapeHtml(button.url)}" style="background:#111827;border-radius:8px;color:#fff;display:inline-block;font-weight:700;padding:12px 18px;text-decoration:none">${escapeHtml(button.label)}</a></p><p style="color:#6b7280;font-size:13px;line-height:1.6">If the button does not work, copy and paste this URL into your browser:<br>${escapeHtml(button.url)}</p>`
    : "";
  return `<!doctype html><html><body style="background:#f3f4f6;color:#111827;font-family:Arial,sans-serif;margin:0;padding:24px"><div style="margin:0 auto;max-width:560px"><div style="background:#111827;border-radius:12px 12px 0 0;color:#fff;padding:22px 28px"><strong style="font-size:20px">I-TRACK</strong></div><main style="background:#fff;border-radius:0 0 12px 12px;padding:28px"><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(title)}</h1><p style="color:#4b5563;line-height:1.6">${escapeHtml(intro)}</p>${body}${action}<p style="border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;margin:28px 0 0;padding-top:18px">This is an automated message from I-TRACK. If you did not expect it, you can ignore it.</p></main></div></body></html>`;
}

export function buildRegistrationEmail(user: UserMailRecipient): MailMessage {
  return {
    subject: "Welcome to I-TRACK",
    text: `Hi ${user.name},\n\nYour I-TRACK account has been created successfully. You can sign in at ${appUrl()}/login.\n\nThanks,\nThe I-TRACK team`,
    html: htmlLayout("Welcome to I-TRACK", `Your account for ${user.email} is ready to use.`, "<p style=\"color:#4b5563;line-height:1.6\">You can now create a workspace, plan work, and keep your team aligned from one place.</p>", { label: "Sign in to I-TRACK", url: `${appUrl()}/login` }),
  };
}

export function buildLoginEmail(user: UserMailRecipient, details: LoginMailDetails = {}): MailMessage {
  const loggedInAt = details.loggedInAt ?? new Date();
  const ipAddress = details.ipAddress || "Unavailable";
  const userAgent = details.userAgent || "Unavailable";
  const body = `<p style="color:#4b5563;line-height:1.6">A sign-in to your I-TRACK account was detected.</p><table style="border-collapse:collapse;color:#4b5563;font-size:14px;width:100%"><tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0"><strong>Time</strong></td><td style="border-bottom:1px solid #e5e7eb;padding:10px 0">${escapeHtml(formatDate(loggedInAt))}</td></tr><tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0"><strong>IP address</strong></td><td style="border-bottom:1px solid #e5e7eb;padding:10px 0">${escapeHtml(ipAddress)}</td></tr><tr><td style="padding:10px 0"><strong>Device</strong></td><td style="padding:10px 0">${escapeHtml(userAgent)}</td></tr></table>`;
  return {
    subject: "New sign-in to your I-TRACK account",
    text: `Hi ${user.name},\n\nA sign-in to your I-TRACK account was detected.\nTime: ${formatDate(loggedInAt)}\nIP address: ${ipAddress}\nDevice: ${userAgent}\n\nIf this was not you, reset your password immediately at ${appUrl()}/forgot-password.`,
    html: htmlLayout("New sign-in detected", `Hi ${user.name}, we detected a new sign-in to your account.`, body, { label: "Review account security", url: `${appUrl()}/forgot-password` }),
  };
}

export function buildInvitationEmail(details: InvitationMailDetails): MailMessage {
  const expiry = formatDate(details.expiresAt);
  return {
    subject: `You have been invited to ${details.organizationName} on I-TRACK`,
    text: `Hi ${details.recipient.name || "there"},\n\n${details.invitedBy} invited you to join ${details.organizationName} on I-TRACK as a ${formatRole(details.role)}.\n\nAccept the invitation: ${details.inviteUrl}\n\nYour invitation verification code is: ${details.otp}\nThis code is valid until the invitation expires on ${expiry}.`,
    html: htmlLayout(`Join ${details.organizationName}`, `${details.invitedBy} invited you to collaborate in this I-TRACK workspace.`, `<p style="color:#4b5563;line-height:1.6">You have been invited as a <strong>${escapeHtml(formatRole(details.role))}</strong>.</p><p style="background:#f3f4f6;border-radius:8px;color:#111827;font-size:28px;font-weight:700;letter-spacing:8px;padding:16px;text-align:center">${escapeHtml(details.otp)}</p><p style="color:#6b7280;font-size:13px;line-height:1.6">Invitation expires: ${escapeHtml(expiry)}</p>`, { label: "Accept invitation", url: details.inviteUrl }),
  };
}

export function buildOtpEmail(user: UserMailRecipient, details: OtpMailDetails): MailMessage {
  const expiresInMinutes = details.expiresInMinutes ?? 10;
  const isRegistration = details.purpose === "registration";
  const title = isRegistration ? "Verify your email" : "Your I-TRACK login code";
  const intro = isRegistration ? `Use this code to verify ${user.email} and finish creating your account.` : `Use this code to finish signing in to ${user.email}.`;
  return {
    subject: isRegistration ? "Verify your I-TRACK email" : "Your I-TRACK login verification code",
    text: `Hi ${user.name},\n\n${intro}\n\nYour verification code is: ${details.otp}\nThis code expires in ${expiresInMinutes} minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: htmlLayout(title, intro, `<p style="background:#f3f4f6;border-radius:8px;color:#111827;font-size:28px;font-weight:700;letter-spacing:8px;padding:16px;text-align:center">${escapeHtml(details.otp)}</p><p style="color:#6b7280;font-size:13px;line-height:1.6">This code expires in ${expiresInMinutes} minutes.</p>`),
  };
}

export function buildPasswordResetEmail(user: UserMailRecipient, resetUrl: string, expiresInMinutes = 60): MailMessage {
  return {
    subject: "Reset your I-TRACK password",
    text: `Hi ${user.name},\n\nWe received a request to reset your I-TRACK password. Use this link within ${expiresInMinutes} minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: htmlLayout("Reset your password", `We received a request to reset the password for ${user.email}.`, `<p style="color:#4b5563;line-height:1.6">This link will expire in ${expiresInMinutes} minutes.</p>`, { label: "Reset password", url: resetUrl }),
  };
}

export const sendRegistrationEmail = (user: UserMailRecipient) => sendTransactionalMail(user, buildRegistrationEmail(user));
export const sendLoginEmail = (user: UserMailRecipient, details?: LoginMailDetails) => sendTransactionalMail(user, buildLoginEmail(user, details));
export const sendInvitationEmail = (details: InvitationMailDetails) => sendTransactionalMail(details.recipient, buildInvitationEmail(details));
export const sendOtpEmail = (user: UserMailRecipient, details: OtpMailDetails) => sendTransactionalMail(user, buildOtpEmail(user, details));
export const sendPasswordResetEmail = (user: UserMailRecipient, resetUrl: string) => sendTransactionalMail(user, buildPasswordResetEmail(user, resetUrl));
