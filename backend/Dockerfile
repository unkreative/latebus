FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .
RUN ls -la src/

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://backend:3000/api/stops || exit 1

CMD ["npm", "start"]