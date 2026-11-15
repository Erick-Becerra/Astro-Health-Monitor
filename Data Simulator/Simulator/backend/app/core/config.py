from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Astro Health Monitor API"
    API_V1_STR: str = "/api/v1"
    # Default PostgreSQL connection string (override via .env)
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/astro_health"
    CORS_ORIGINS: list[str] = ["*"]

    # Agency career radiation limits (mSv)
    NASA_CAREER_LIMIT_MSV: float = 600.0
    CSA_ESA_CAREER_LIMIT_MSV: float = 1000.0
    SPE_ACUTE_LIMIT_MSV: float = 250.0

    class Config:
        env_file = ".env"


settings = Settings()