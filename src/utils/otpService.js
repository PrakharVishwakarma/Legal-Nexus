// /utils/otpService.js

const twilio = require("twilio"); 

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

// Check if Twilio environment variables are set
if (!accountSid || !authToken || !fromNumber) {
    console.error("Error: Twilio configuration is missing.");
    process.exit(1);
}
 
const client = twilio(accountSid, authToken);

const generateOTP = (length = 6) => {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
};

async function sendOTP(phone, otp) {
    try {
        if (!/^\+?[1-9]\d{1,14}$/.test(phone)) {
            throw new Error("Invalid phone number format");
        }

        const message = await client.messages.create({
            body: `Your OTP for Legal Nexus is: ${otp}`,
            from: fromNumber,
            to: phone,
        });
        console.log(`OTP sent to ${phone}: ${message.sid}`);
        return true; 
    } catch (error) {
        console.error("Error sending OTP:", error);
        return false; 
    }
}

module.exports = { generateOTP, sendOTP };
