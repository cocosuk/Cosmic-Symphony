# frontend/Dockerfile
FROM node:18-alpine AS dev

WORKDIR /app

# 1) Копируем manifest и ставим зависимости
COPY package*.json ./
RUN npm install

# 2) Копируем исходники
COPY . .

# 3) Открываем порт Vite и запускаем в dev-режиме
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
