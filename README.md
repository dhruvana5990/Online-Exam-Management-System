# Online Examination System

A full-stack college project: instructors create multiple-choice exams, publish them, and students take exams and review automatically calculated results.

## Stack
- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Database: Supabase PostgreSQL
- Security: bcrypt password hashing, signed JWTs, Helmet, rate limiting

## Setup (Windows / VS Code)
1. Install Node.js LTS from https://nodejs.org/ and create a Supabase project at https://supabase.com/.
2. In Supabase SQL Editor, run all of `database/schema.sql`.
3. Open `backend/.env` and replace the placeholder Supabase URL, service-role key, and JWT secret with your own values. Keep these secrets private; never place them in frontend files or upload `.env` to GitHub.
4. In VS Code terminal:
   ```powershell
   cd backend
   npm install
   npm start
   ```
5. Open http://localhost:3000. Health endpoint: http://localhost:3000/api/health.
6. Register an instructor account, create an exam, add questions, publish it. Sign out, register a student account using a different email, take the exam, then review My Results.

The server must stay running while you use the app. Stop it with Ctrl+C.

## Features
- Student and instructor accounts
- Create exams with optional availability dates and duration
- Four-option multiple-choice questions
- Draft/published exam states
- Server-side answer scoring and saved results
- One attempt per student per exam
- Role checks and input validation

## Notes and limitations
This is an educational MVP, not a production exam platform. The browser timer is a convenience and does not enforce a strict per-attempt deadline on the server. Roles can be selected during registration; a real deployment should require administrator approval. This demo stores its JWT in localStorage; production systems should use carefully reviewed secure session handling. No real credentials or live database are included.

## GitHub safety
`backend/.env` and `node_modules/` are ignored. Commit `backend/.env.example`, not `.env`. If a secret is exposed, rotate it immediately.
