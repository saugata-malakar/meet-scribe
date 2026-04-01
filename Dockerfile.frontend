FROM node:20-slim

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --legacy-peer-deps

COPY frontend/ .

ENV NEXT_PUBLIC_API_URL=https://chi-square-1.onrender.com
ENV NEXT_PUBLIC_WS_URL=wss://chi-square-1.onrender.com
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Z3VpZGluZy1nb2xkZmlzaC0zNy5jbGVyay5hY2NvdW50cy5kZXYk
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
