# Use the official lightweight Node.js alpine image
FROM node:20-alpine

# Set the production environment
ENV NODE_ENV=production

# Create and set the working directory
WORKDIR /usr/src/app

# Copy dependency manifests first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Change ownership of the files to the default non-root node user for security
RUN chown -R node:node /usr/src/app

# Run the container under the non-root user
USER node

# Expose the application port
EXPOSE 3000

# Start the application
CMD [ "node", "server.js" ]
