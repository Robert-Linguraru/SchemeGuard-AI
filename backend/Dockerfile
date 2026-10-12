FROM eclipse-temurin:26-jdk-noble AS build

WORKDIR /workspace/backend

RUN apt-get update \
    && apt-get install -y maven \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pom.xml ./pom.xml
COPY backend/src ./src
COPY db/utils/Nuke.sql /workspace/db/utils/Nuke.sql

RUN mvn -DskipTests package

FROM eclipse-temurin:26-jre-noble

WORKDIR /app

COPY --from=build /workspace/backend/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
