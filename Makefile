COMPOSE ?= docker compose

.PHONY: up down test logs build
up:
	$(COMPOSE) up -d --build --wait
down:
	$(COMPOSE) down
test:
	$(COMPOSE) run --rm api pytest
	$(COMPOSE) run --rm web npm run check
build:
	$(COMPOSE) build
logs:
	$(COMPOSE) logs -f
