# Use an official Node.js image as the base image
FROM node:22

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy the application code into the Docker image
COPY . .

# Install the application dependencies
RUN npm install

# Expose the necessary port for the application
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
