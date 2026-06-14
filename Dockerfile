FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY . .

ENV NODE_ENV=production
EXPOSE 4173

CMD ["npm", "start"]
