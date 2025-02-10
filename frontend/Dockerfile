FROM node:18-alpine

# Add tini for proper signal handling
RUN apk add --no-cache tini

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 5173

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5173 || exit 1

# Use tini as the init process
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]