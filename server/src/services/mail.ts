import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const templateDirectories = [
  path.resolve(process.cwd(), "templates", "mail"),
  path.resolve(process.cwd(), "server", "templates", "mail"),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../templates/mail"),
];

function renderMailTemplate(fileName: string, values: Record<string, string>) {
  const templatePath = templateDirectories
    .map((directory) => path.join(directory, fileName))
    .find((candidate) => fs.existsSync(candidate));

  if (!templatePath) {
    throw new Error(`Mail template not found: ${fileName}`);
  }

  return Object.entries(values).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    fs.readFileSync(templatePath, "utf8"),
  );
}

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

export function buildRegistrationEmail(user: UserMailRecipient): MailMessage {
  return {
    subject: "Welcome to I-TRACK",
    text: `Hi ${user.name},\n\nYour I-TRACK account has been created successfully. You can sign in at ${appUrl()}/login.\n\nThanks,\nThe I-TRACK team`,
    html: renderMailTemplate("registration.html", { name: escapeHtml(user.name), email: escapeHtml(user.email), loginUrl: escapeHtml(`${appUrl()}/login`) }),
  };
}

export function buildLoginEmail(user: UserMailRecipient, details: LoginMailDetails = {}): MailMessage {
  const loggedInAt = details.loggedInAt ?? new Date();
  const ipAddress = details.ipAddress || "Unavailable";
  const userAgent = details.userAgent || "Unavailable";
  return {
    subject: "New sign-in to your I-TRACK account",
    text: `Hi ${user.name},\n\nA sign-in to your I-TRACK account was detected.\nTime: ${formatDate(loggedInAt)}\nIP address: ${ipAddress}\nDevice: ${userAgent}\n\nIf this was not you, reset your password immediately at ${appUrl()}/forgot-password.`,
    html: renderMailTemplate("login.html", { name: escapeHtml(user.name), loggedInAt: escapeHtml(formatDate(loggedInAt)), ipAddress: escapeHtml(ipAddress), userAgent: escapeHtml(userAgent), securityUrl: escapeHtml(`${appUrl()}/forgot-password`) }),
  };
}

export function buildInvitationEmail(details: InvitationMailDetails): MailMessage {
  const expiry = formatDate(details.expiresAt);
  return {
    subject: `You have been invited to ${details.organizationName} on I-TRACK`,
    text: `Hi ${details.recipient.name || "there"},\n\n${details.invitedBy} invited you to join ${details.organizationName} on I-TRACK as a ${formatRole(details.role)}.\n\nAccept the invitation: ${details.inviteUrl}\n\nYour invitation verification code is: ${details.otp}\nThis code is valid until the invitation expires on ${expiry}.`,
    html: renderMailTemplate("invitation.html", { recipientName: escapeHtml(details.recipient.name || "there"), organizationName: escapeHtml(details.organizationName), invitedBy: escapeHtml(details.invitedBy), role: escapeHtml(formatRole(details.role)), otp: escapeHtml(details.otp), expiry: escapeHtml(expiry), inviteUrl: escapeHtml(details.inviteUrl) }),
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
    html: renderMailTemplate("otp.html", { title: escapeHtml(title), name: escapeHtml(user.name), intro: escapeHtml(intro), otp: escapeHtml(details.otp), expiresInMinutes: escapeHtml(String(expiresInMinutes)) }),
  };
}

export function buildPasswordResetEmail(user: UserMailRecipient, resetUrl: string, expiresInMinutes = 60): MailMessage {
  return {
    subject: "Reset your I-TRACK password",
    text: `Hi ${user.name},\n\nWe received a request to reset your I-TRACK password. Use this link within ${expiresInMinutes} minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: renderMailTemplate("password-reset.html", { email: escapeHtml(user.email), expiresInMinutes: escapeHtml(String(expiresInMinutes)), resetUrl: escapeHtml(resetUrl) }),
  };
}

export const sendRegistrationEmail = (user: UserMailRecipient) => sendTransactionalMail(user, buildRegistrationEmail(user));
export const sendLoginEmail = (user: UserMailRecipient, details?: LoginMailDetails) => sendTransactionalMail(user, buildLoginEmail(user, details));
export const sendInvitationEmail = (details: InvitationMailDetails) => sendTransactionalMail(details.recipient, buildInvitationEmail(details));
export const sendOtpEmail = (user: UserMailRecipient, details: OtpMailDetails) => sendTransactionalMail(user, buildOtpEmail(user, details));
export const sendPasswordResetEmail = (user: UserMailRecipient, resetUrl: string) => sendTransactionalMail(user, buildPasswordResetEmail(user, resetUrl));
