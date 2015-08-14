.PHONY: test

install:
	npm install

test:
	nbt verify --skip-layout-checks --skip-dotenv-check
	mocha
