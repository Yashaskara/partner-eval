from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .seeds.seed import seed_profile_questions

seed_profile_questions()

app = FastAPI(title="Anvaya", docs_url=None, redoc_url=None)

origins = [o for o in ["http://localhost:5173", config.APP_URL] if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .auth import router as auth_router
from .routes.access_requests import router as access_requests_router
from .routes.admin import router as admin_router
from .routes.analysis import router as analysis_router
from .routes.conversations import router as conversations_router
from .routes.partners import router as partners_router
from .routes.prep_questions import router as prep_questions_router
from .routes.profile_qa import router as profile_qa_router
from .routes.self_profile import router as self_profile_router
from .routes.settings import router as settings_router

app.include_router(auth_router)
app.include_router(access_requests_router)
app.include_router(admin_router)
app.include_router(analysis_router)
app.include_router(conversations_router)
app.include_router(partners_router)
app.include_router(prep_questions_router)
app.include_router(profile_qa_router)
app.include_router(self_profile_router)
app.include_router(settings_router)


@app.get("/api/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.src.main:app",
        host="0.0.0.0",
        port=config.BACKEND_PORT,
        reload=True,
    )
