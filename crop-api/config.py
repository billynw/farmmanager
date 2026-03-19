from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://user:password@localhost:3306/cropworks"
    SECRET_KEY: str = "change-this-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7日
    PHOTO_DIR: str = "/var/crop-photos"
    ALLOWED_ORIGINS: str = "https://crop.example.com"

    class Config:
        env_file = ".env"

settings = Settings()
