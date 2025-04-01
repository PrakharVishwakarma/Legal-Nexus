# Node-Express Backend Authentication System

## Features Implemented

### 1. User Authentication  

#### 1.1 User Signup (`/signup`)  
**Functionality:**  
- New users can register with the following details:  
  - **Role**: Admin, Judge, Lawyer, Police, Civilian  
  - **Personal Information**: `firstName`, `lastName`, `aadharNumber`, `phoneNumber`, etc.  
  - **Password**  
- OTP is sent to the provided phone number for verification via Twilio.  
- For **restricted roles** (Judge, Lawyer, Police):  
  - The `employeeId` is verified against the centralized Employee collection.  

**Security Measures:**  
- **Password Hashing**: Passwords are hashed using bcrypt.  
- **OTP Expiry**: OTPs expire after 60 seconds to prevent reuse.  
- **Unique User Validation**: Ensures unique `phoneNumber`, `aadharNumber`, and `employeeId`.  

**Error Handling:**  
- Clear error messages for invalid inputs, duplicate users, and unverified employees.  

#### 1.2 OTP Verification (`/verify-otp`)  
**Functionality:**  
- Verifies the OTP sent during signup.  
- Marks the user as verified (`isVerified = true`) if OTP is valid and not expired.  

**Security Measures:**  
- **Hash Matching**: Compares the hashed OTP stored in the database with the user-provided OTP.  
- **Expiry Validation**: Rejects OTPs after 60 seconds.  

**Error Handling:**  
- Handles invalid and expired OTPs with clear error messages.  

---

### 2. User Login (`/signin`)  
**Functionality:**  
- Users log in using:  
  - **Role**  
  - **Identifier**: `userId` (for Civilians/Admins), `employeeId` (for restricted roles)  
  - **Password**  
- On successful login, a **JWT token** is generated, valid for **7 days**.  

**Security Measures:**  
- **Role-Specific Validation**: Ensures identifiers match the role.  
- **Password Validation**: Validates passwords securely using bcrypt.  
- **JWT Issuance**: Tokens are signed with **HS256** and include role and user details.  

**Error Handling:**  
- Different error responses for:  
  - Invalid user credentials.  
  - Unverified users attempting to log in.  

---

### 3. User Logout (`/logout`)  
**Functionality:**  
- Logs out the user by blacklisting their **JWT token**.  
- Prevents token reuse after logout.  

**Security Measures:**  
- **Token Blacklisting**: In-memory storage is used for blacklisted tokens, with an option to integrate Redis for scalability.  
- **Global Middleware**: All requests pass through middleware to check if the token is blacklisted.  

**Error Handling:**  
- Handles requests without tokens or with invalid/expired tokens.  

---

### 4. Role-Based Access Control  

#### 4.1 Middleware for Role-Based Restrictions  
- `authMiddleware`:  
  - Verifies **JWT tokens** and attaches user details (`userId`, `role`) to requests.  
- `roleMiddleware`:  
  - Restricts access to routes based on the user’s role.  

#### 4.2 Restriction of Unauthenticated Routes  
- `restrictAuthenticated`:  
  - Prevents logged-in users from accessing routes like `/signup` and `/verify-otp`.  

---

### 5. Forgot Password Functionality  

#### 5.1 Request Password Reset (`/forgot-password/request-reset`)  
**Functionality:**  
- Users can request a password reset by providing their registered **phone number**.  
- A reset **OTP** is generated and sent via **Twilio**.  
- The OTP is stored in a **hashed form** with an expiry of **120 seconds**.  

**Security Measures:**  
- **Generic Error Responses**: Prevents information leakage by responding generically to unregistered phone numbers.  
- **Rate Limiting**: Limits OTP requests to once every 60 seconds per user.  

**Error Handling:**  
- Handles invalid phone numbers and Twilio failures gracefully.  

#### 5.2 Reset Password (`/forgot-password/reset`)  
**Functionality:**  
- Verifies the reset OTP and updates the user’s password.  
- Clears the OTP and expiry fields after a successful password reset.  

**Security Measures:**  
- **OTP Expiry Validation**: Rejects expired OTPs.  
- **Password Hashing**: Ensures the new password is securely stored.  

**Error Handling:**  
- Returns appropriate messages for invalid or expired OTPs.  

---

### 6. Database Design  

#### 6.1 User Collection  
**Fields Added:**  
- `resetOtp`: Stores the hashed OTP for password reset.  
- `resetOtpExpiry`: Stores the expiry timestamp of the OTP.  

#### 6.2 Employee Collection  
**Purpose:**  
- Verifies `employeeId` for restricted roles like Judge, Lawyer, and Police.  
- Includes fields for `role` and `verificationStatus`.  

---

### 7. Utility Services  

#### 7.1 OTP Service  
**Features:**  
- Generates **random OTPs** of configurable length.  
- Sends OTPs via **Twilio**.  

**Error Handling:**  
- Logs errors for invalid phone numbers or failed OTP delivery.  

#### 7.2 Token Blacklist Service  
**Features:**  
- Blacklists JWT tokens on logout.  
- Globally blocks blacklisted tokens from accessing any routes.  

---

### 8. Validation and Security  

#### **Input Validation with Zod**  
Added **Zod schemas** for:  
- Signup  
- Login  
- OTP verification  
- Password reset  

#### **Enhanced Security Measures**  
- **Password Security**:  
  - All passwords are **hashed** with bcrypt before storage.  
- **JWT Security**:  
  - Tokens are signed with **HS256** and include expiration.  
- **OTP Security**:  
  - OTPs are **hashed** in the database to prevent misuse.  
- **Rate Limiting**:  
  - Limits frequent requests to prevent abuse of password reset functionality.  

---

### 9. Error Handling  

#### **Consistency:**  
- Clear and **user-friendly error messages** across all routes.  

#### **Generic Responses:**  
- Prevents **information leakage**, e.g., unregistered phone numbers.  

---

## 📌 Conclusion  
This **Node.js Express Backend** provides a **secure authentication system** with role-based access control, OTP-based verification, JWT authentication, and password reset functionality. It follows **best security practices** including password hashing, token validation, and role-based restrictions.  

---

🔹 **Author**: _[Your Name]_  
🔹 **Technologies Used**: Node.js, Express.js, JWT, Bcrypt, Twilio, Zod  
🔹 **License**: MIT  

