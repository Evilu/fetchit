-- Create enum types
CREATE TYPE user_status AS ENUM ('pending', 'active', 'blocked');
CREATE TYPE group_status AS ENUM ('empty', 'notEmpty');

-- Create groups table
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status group_status NOT NULL DEFAULT 'empty'
);

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    status user_status NOT NULL DEFAULT 'pending',
    group_id INTEGER REFERENCES groups(id)
);

-- Create indexes
CREATE INDEX idx_users_group_id ON users(group_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_groups_status ON groups(status);

-- Seed data: Create groups
INSERT INTO groups (name, status) VALUES
    ('Engineering', 'notEmpty'),
    ('Marketing', 'notEmpty'),
    ('Sales', 'notEmpty'),
    ('HR', 'empty'),
    ('Finance', 'notEmpty');

-- Seed data: Create users
INSERT INTO users (username, status, group_id) VALUES
    ('alice', 'active', 1),
    ('bob', 'active', 1),
    ('charlie', 'pending', 1),
    ('david', 'active', 2),
    ('eve', 'blocked', 2),
    ('frank', 'active', 3),
    ('grace', 'pending', 3),
    ('henry', 'active', 3),
    ('ivy', 'active', 5),
    ('jack', 'pending', NULL),
    ('karen', 'active', NULL),
    ('leo', 'blocked', NULL);
