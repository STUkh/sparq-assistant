# Login Feature Requirements

## Overview
Users must be able to authenticate using email and password credentials. The login page must be accessible and secure.

## Functional Requirements
- FR-1: User can log in with a valid email and password
- FR-2: User is redirected to the dashboard after successful login
- FR-3: User sees an inline error message for invalid email format
- FR-4: User sees an error message after entering incorrect credentials
- FR-5: User account is locked after 5 consecutive failed login attempts

## Non-Functional Requirements
- NFR-1: Login form loads within 2 seconds on 3G connection
- NFR-2: All form fields have appropriate aria-label attributes
- NFR-3: Tab order follows logical sequence: email, password, sign in button
- NFR-4: CSRF token required on form submission

## User Journey
1. User navigates to /login
2. User enters email
3. User enters password
4. User clicks "Sign In"
5. On success: redirect to /dashboard
6. On failure: show inline error, retain field values

## Edge Cases
- Both fields submitted empty
- Password field receives paste of 256+ characters
- Network timeout during credential validation
