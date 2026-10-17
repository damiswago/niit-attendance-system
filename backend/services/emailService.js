import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendPasswordResetEmail = async (email, resetToken) => {
    const resetLink = `http://127.0.0.1:5500/frontend/reset-password.html?token=${resetToken}`;

    const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: email,
        subject: "Password Reset Request",
        html: `
            <h2>Password Reset</h2>

            <p>You requested to reset your password for the NIIT Attendance Management System.</p>

            <p>Click the link below to reset your password:</p>

            <a href="${resetLink}">Reset Password</a>

            <p>This link should only be used once and should be treated as confidential.</p>

            <p>If you did not request a passsword reset, you can ignore this email.</p>
        `,
    });

    if (error) {
        throw new Error(error.message);
    }

    return data;
};

// Resend accepts up to 100 emails per batch call. Sending a class one email at
// a time would exceed Resend's request rate limit, so notices go out in batches.
export const EMAIL_BATCH_SIZE = 100;

// messages: [{ to, subject, html, text }] (at most EMAIL_BATCH_SIZE).
// Throws if Resend rejects the batch.
export const sendEmailBatch = async (messages) => {
    const { data, error } = await resend.batch.send(
        messages.map((message) => ({
            from: process.env.RESEND_FROM_EMAIL,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
        }))
    );

    if (error) {
        throw new Error(error.message);
    }

    return data;
};