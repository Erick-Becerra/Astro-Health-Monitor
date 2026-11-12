FROM node:22-alpine

WORKDIR /app

# Install dependencies first so Docker can cache this layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Development server with hot reload (the page updates when you save a file).
CMD ["npm", "run", "dev"]
