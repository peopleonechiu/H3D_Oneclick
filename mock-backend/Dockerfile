FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV PORT=11234
ENV MOCK_STEP_DELAY_MS=120

EXPOSE 11234
CMD ["node", "src/server.mjs"]
