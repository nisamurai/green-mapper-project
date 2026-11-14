import nodemailer from "nodemailer";

type SendEmailInput = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

function getRequiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is missing`);
	return value;
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput) {
	const host = getRequiredEnv("SMTP_HOST");
	const port = Number(getRequiredEnv("SMTP_PORT"));
	const user = getRequiredEnv("SMTP_USER");
	const pass = getRequiredEnv("SMTP_PASS");
	const from = getRequiredEnv("SMTP_FROM");

	const transporter = nodemailer.createTransport({
		host,
		port,
		secure: port === 465,
		auth: { user, pass },
	});

	await transporter.sendMail({
		from,
		to,
		subject,
		text,
		html,
	});
}

