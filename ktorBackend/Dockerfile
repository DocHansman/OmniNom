# Stage 1: Build the Ktor application
FROM gradle:8-jdk21 AS build
COPY --chown=gradle:gradle . /home/gradle/src
WORKDIR /home/gradle/src
RUN gradle buildFatJar --no-daemon

# Stage 2: Run the application
FROM eclipse-temurin:21-jre-alpine

# Install tools needed for QR generation and database inspection
RUN apk add --no-cache bash libqrencode-tools postgresql-client

WORKDIR /app

# Copy the built fat jar from the builder stage
COPY --from=build /home/gradle/src/build/libs/*-all.jar /app/ktorBackend.jar

# Expose Ktor port
EXPOSE 8080

# Run the application
CMD ["java", "-jar", "/app/ktorBackend.jar"]
