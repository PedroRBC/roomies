FROM docker.io/library/node:24-alpine AS tools
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["sh", "-c", "npm run check && npm test"]

FROM tools AS runtime
ENV NODE_ENV=production
RUN adduser -D -H -u 10001 roomies && npm prune --omit=dev
USER 10001:10001
EXPOSE 3000
CMD ["npm", "start"]
