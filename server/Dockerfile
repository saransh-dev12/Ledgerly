FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production=false
COPY . .
RUN npx prisma generate && npm run build
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
