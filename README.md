# Backend API với TypeScript, Prisma, Docker, JWT và Google OAuth2

## Mô tả dự án

Dự án backend xây dựng bằng **TypeScript**, sử dụng **Prisma ORM** để kết nối và thao tác với cơ sở dữ liệu PostgreSQL. Dự án hỗ trợ xác thực người dùng bằng **JWT** và đăng nhập qua **Google OAuth2**.

Dự án được đóng gói trong Docker container để dễ dàng triển khai và phát triển.

---

## Công nghệ sử dụng

- Node.js & TypeScript
- Prisma ORM (với PostgreSQL)
- Docker & Docker Compose
- JWT Authentication
- Google OAuth2
- Postgres Database

---

## Cách chạy dự án

### Yêu cầu

- Docker & Docker Compose đã được cài đặt
- Node.js (chỉ cần khi bạn muốn chạy local không dùng Docker)

### 1. Cấu hình biến môi trường

Tạo file `.env` trong root dự án với các biến sau:

```env
POSTGRES_URL=postgresql://myuser:mypassword@postgres-db:5432/mydatabase
PORT=3000
GOOGLE_CLIENT_ID=your-google-client-id
JWT_SECRET=your-jwt-secret
```

### 2. Chạy bằng Docker Compose

```bash
docker-compose up -d
```

### 3. Chạy local (không dùng Docker)

```bash
npm install
npx prisma generate
npx tsc
node dist/server.js
```

### 4. API Endpoints chính


| Phương thức | URL           | Mô tả                        |
|-------------|---------------|------------------------------|
| POST        | /auth/login   | Đăng nhập bằng JWT            |
| POST        | /auth/google  | Đăng nhập bằng Google OAuth2  |
| POST        | /auth/logout  | Đăng xuất                    |
| GET         | /auth/signup  | Đăng kí                     |


## Google Sheet tracking

Set Google Sheets API service-account env vars to enable Google-login tracking:

```env
GOOGLE_SHEET_ID=your-sheet-id
GOOGLE_SHEET_RANGE=Trang tính1!A:E
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Share the Google Sheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL` as editor. Endpoint `POST /api/tracking/google-login` appends one row directly through Google Sheets API:

```txt
email | location | ip | utm_source | utm_campaign
```

