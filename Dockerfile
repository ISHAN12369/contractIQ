# Dockerfile for Hugging Face Spaces deployment
FROM node:18-alpine

WORKDIR /app

# Copy configuration files
COPY package*.json ./

# Install dependencies (using npm ci for clean reproducible builds)
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the Next.js production bundle
RUN npm run build

# Expose the port Hugging Face expects (7860)
EXPOSE 7860

# Next.js environment configurations
ENV PORT 7860
ENV HOSTNAME "0.0.0.0"
ENV NODE_ENV production

# Start Next.js server on port 7860
CMD ["npm", "run", "start"]
