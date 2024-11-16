const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  auth: {
    user: "marvin2@ethereal.email",
    pass: "kysANaqstPPffkkxSn",
  },
});

const sendTestEmail = async () => {
  const info = await transporter.sendMail({
    from: '"Marvin Nitzsche" <marvin2@ethereal.email>',
    to: "muller.stephane@gmail.com",
    subject: "Hello from Ethereal!",
    text: "This is a test email.",
    html: "<b>This is a test email.</b>",
  });

  console.log("Message sent: %s", info.messageId);
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
};

sendTestEmail();
