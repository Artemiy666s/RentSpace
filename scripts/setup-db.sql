CREATE DATABASE IF NOT EXISTS rent_space CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'rent_space_user'@'localhost' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON rent_space.* TO 'rent_space_user'@'localhost';
FLUSH PRIVILEGES;
