Features Implemented
1. User Signup (/signup)
Functionality
New users can register with the following details:

Role: (Admin, Judge, Lawyer, Police, Civilian)

Personal Information: (firstName, lastName, aadharNumber, phoneNumber, etc.)

Password

OTP Verification: OTP is sent to the provided phone number via Twilio.

Restricted Roles Validation:

For Judge, Lawyer, and Police, employeeId is verified against the centralized Employee collection.

Security Measures
Password Hashing: Passwords are securely hashed using bcrypt.

OTP Expiry: OTPs expire after 60 seconds to prevent reuse.

Unique User Validation: Ensures unique phoneNumber, aadharNumber, and employeeId.

Error Handling
Clear error messages for:

Invalid inputs

Duplicate users

Unverified employees

2. OTP Verification (/verify-otp)
Functionality
Verifies the OTP sent during signup.

Marks the user as verified (isVerified = true) if OTP is valid and not expired.

Security Measures
Hash Matching: Compares the hashed OTP in the database with the user-provided OTP.

Expiry Validation: Rejects OTPs after 60 seconds.

Error Handling
Handles invalid and expired OTPs with clear error messages.

3. User Login (/signin)
Functionality
Users log in using:

Role

Identifier: (userId for Civilians/Admins, employeeId for restricted roles)

**Password`

On successful login:

A JWT token is generated (valid for 7 days).

Security Measures
Role-Specific Validation: Ensures identifiers match the user's role.

Password Validation: Securely validates passwords using bcrypt.

JWT Issuance:

Tokens are signed with HS256

Includes role and user details.

Error Handling
Provides different error responses for:

Invalid credentials

Unverified users attempting to log in.

4. User Logout (/logout)
Functionality
Logs out the user by blacklisting their JWT token.

Prevents token reuse after logout.

Security Measures
Token Blacklisting:

Uses in-memory storage for blacklisted tokens.

Option to integrate Redis for scalability.

Global Middleware:

All requests pass through middleware to check if the token is blacklisted.

Error Handling
Handles requests with:

Missing tokens

Invalid or expired tokens

Role-Based Access Control
4.1 Middleware for Role-Based Restrictions
authMiddleware:

Verifies JWT tokens.

Attaches user details (userId, role) to requests.

roleMiddleware:

Restricts access to routes based on the user’s role.

4.2 Restriction of Unauthenticated Routes
Middleware (restrictAuthenticated):

Prevents logged-in users from accessing routes like /signup and /verify-otp.

Forgot Password Functionality
5.1 Request Password Reset (/forgot-password/request-reset)
Functionality
Users request a password reset by providing their registered phone number.

A reset OTP is generated and sent via Twilio.

The OTP is stored in hashed form with an expiry of 120 seconds.

Security Measures
Generic Error Responses:

Prevents information leakage by providing generic responses for unregistered phone numbers.

Rate Limiting:

Limits OTP requests to once every 60 seconds per user.

Error Handling
Gracefully handles:

Invalid phone numbers

Twilio failures

5.2 Reset Password (/forgot-password/reset)
Functionality
Verifies the reset OTP.

Updates the user’s password.

Clears the OTP and expiry fields after a successful reset.

Security Measures
OTP Expiry Validation: Rejects expired OTPs.

Password Hashing: Stores the new password securely.

Error Handling
Returns appropriate messages for:

Invalid or expired OTPs.

Database Design
6.1 User Collection
Fields Added
resetOtp: Stores the hashed OTP for password reset.

resetOtpExpiry: Stores the expiry timestamp of the OTP.

6.2 Employee Collection
Purpose
Verifies employeeId for restricted roles (Judge, Lawyer, Police).

Includes fields for:

Role

Verification Status

Utility Services
7.1 OTP Service
Features
Generates random OTPs of configurable length.

Sends OTPs via Twilio.

Error Handling
Logs errors for:

Invalid phone numbers

Failed OTP delivery

7.2 Token Blacklist Service
Features
Blacklists JWT tokens on logout.

Globally blocks blacklisted tokens from accessing any routes.

Validation and Security
8.1 Input Validation with Zod
Zod Schemas Added For:
Signup

Login

OTP Verification

Password Reset

8.2 Enhanced Security Measures
Password Security
All passwords are hashed with bcrypt before storage.

JWT Security
Tokens are signed with HS256 and include expiration.

OTP Security
OTPs are hashed in the database to prevent misuse.

Rate Limiting
Limits frequent requests to prevent abuse of password reset functionality.

Error Handling
9.1 Consistency
Clear and user-friendly error messages across all routes.

9.2 Generic Responses
Prevents information leakage (e.g., unregistered phone numbers). +++