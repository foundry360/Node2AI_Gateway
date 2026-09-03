FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json next.config.js tsconfig.json ./
COPY src ./src
COPY public ./public
ARG GATEWAY_URL=http://gateway:8080
ARG GATEWAY_ADMIN_API_KEY=n2ai_admin_dev_key
ENV GATEWAY_URL=$GATEWAY_URL
ENV GATEWAY_ADMIN_API_KEY=$GATEWAY_ADMIN_API_KEY
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3080
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
ARG GATEWAY_URL=http://gateway:8080
ARG GATEWAY_ADMIN_API_KEY=n2ai_admin_dev_key
ENV GATEWAY_URL=$GATEWAY_URL
ENV GATEWAY_ADMIN_API_KEY=$GATEWAY_ADMIN_API_KEY
EXPOSE 3080
CMD ["node", "server.js"]
