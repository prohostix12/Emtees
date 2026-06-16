import nodemailer from "nodemailer";


const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
};

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

export async function sendUserCredentialsEmail({
  email,
  name,
  username,
  password,
  loginUrl,
}: {
  email: string;
  name: string;
  username: string;
  password: string;
  loginUrl: string;
}): Promise<SendEmailResult> {
  const mailSubject = "Your LMS Account Created - Emtees Academy";
  const fromAddress = process.env.SMTP_FROM || '"EMTEES Academy Administration" <noreply@your-lms-domain.com>';

  const mailText = `Dear ${name},

Your LMS account has been created successfully.

Username: ${username}
Temporary Password: ${password}

Login URL: ${loginUrl}

For security reasons, you will be required to change your password upon your first login.

Regards,
EMTEES Academy Administration`;

  const mailHtml = `<div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; rounded: 8px;">
  <h2 style="color: #059669; margin-bottom: 20px;">Welcome to Emtees Academy!</h2>
  <p>Dear ${name},</p>
  <p>Your LMS account has been created successfully.</p>
  <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e5e7eb;">
    <p style="margin: 0 0 10px 0;"><strong>Username:</strong> <code style="font-size: 1.1em; color: #111827;">${username}</code></p>
    <p style="margin: 0 0 10px 0;"><strong>Temporary Password:</strong> <code style="font-size: 1.1em; color: #111827;">${password}</code></p>
    <p style="margin: 0;"><strong>Login URL:</strong> <a href="${loginUrl}" style="color: #059669; text-decoration: underline;">${loginUrl}</a></p>
  </div>
  <p style="color: #ef4444; font-weight: 500;">For security reasons, you will be required to change your password upon your first login.</p>
  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 25px 0;" />
  <p style="font-size: 0.9em; color: #6b7280; margin: 0;">Regards,<br /><strong>EMTEES Academy Administration</strong></p>
</div>`;

  const transporter = getTransporter();

  if (!transporter) {
    // Simulation mode
    console.log("==================================================");
    console.log(`[SIMULATED EMAIL SENT] to: ${email}`);
    console.log(`Subject: ${mailSubject}`);
    console.log("--------------------------------------------------");
    console.log(mailText);
    console.log("==================================================");
    return { success: true };
  }

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: mailSubject,
      text: mailText,
      html: mailHtml,
    });
    return { success: true };
  } catch (err: any) {
    console.error(`[Email Delivery Failure] to ${email}:`, err);
    return { success: false, error: err.message || String(err) };
  }
}
