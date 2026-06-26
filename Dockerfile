FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4317
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/agents ./agents
COPY --from=build /app/domain ./domain
COPY --from=build /app/runtime ./runtime
COPY --from=build /app/workspace ./workspace
EXPOSE 4317
CMD ["node", "dist/runtime/server.js"]
