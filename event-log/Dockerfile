FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p logs
EXPOSE 3004
CMD ["node", "index.js"]
