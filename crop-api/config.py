from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://user:password@localhost:3306/cropworks"
    SECRET_KEY: str = "change-this-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7日
    PHOTO_DIR: str = "/var/crop-photos"
    SENSOR_PHOTO_DIR: str = "/var/crop-sensor-photos"
    ALLOWED_ORIGINS: str = "https://crop.example.com"
    FRONTEND_URL: str = "https://crop.example.com"

    # SMTP設定
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 25
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@example.com"
    SMTP_TLS: bool = False

    class Config:
        env_file = ".env"

settings = Settings()
