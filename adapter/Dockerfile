FROM node:24-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8787
ENV BACKEND_URL=http://mock-backend:11234
ENV DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "src/server.mjs"]
