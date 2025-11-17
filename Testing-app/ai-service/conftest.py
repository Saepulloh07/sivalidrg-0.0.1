# tests/conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base
from app.database import get_db
import os
from datetime import datetime, date

# Test database URL
TEST_DATABASE_URL = "mysql+pymysql://root:@localhost:3306/sivalidrg_test"

@pytest.fixture(scope="session")
def engine():
    """Create test database engine"""
    engine = create_engine(
        TEST_DATABASE_URL,
        pool_pre_ping=True,
        echo=False
    )
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    yield engine
    
    # Drop all tables after tests
    Base.metadata.drop_all(bind=engine)
    engine.dispose()

@pytest.fixture(scope="function")
def db_session(engine):
    """Create a new database session for a test"""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def sample_patient(db_session):
    """Create sample patient for testing"""
    from app.models import Patient, GenderEnum
    
    patient = Patient(
        norm="TEST-RM-001",
        name="Test Patient",
        birth_date=date(1980, 1, 1),
        gender=GenderEnum.male
    )
    db_session.add(patient)
    db_session.commit()
    db_session.refresh(patient)
    
    return patient

@pytest.fixture
def sample_medical_records(db_session, sample_patient):
    """Create sample medical records"""
    from app.models import (
        CPPT, ResumeMedis, Penunjang, ObservasiVital
    )
    
    # CPPT
    cppt = CPPT(
        norm=sample_patient.norm,
        tanggal=date.today(),
        jam=datetime.now().time(),
        profesi="Dokter",
        catatan="Diagnosis: Diabetes mellitus tipe 2 tidak terkontrol. Hipertensi stage 2.",
        instruksi="Insulin, Captopril, diet DM"
    )
    db_session.add(cppt)
    
    # Resume Medis
    resume = ResumeMedis(
        norm=sample_patient.norm,
        diagnosa_utama="Diabetes mellitus tipe 2 tidak terkontrol",
        diagnosa_penyerta="Hipertensi stage 2, Anemia defisiensi besi",
        tindakan="Pemasangan kateter urin",
        icd10_diagnosa_utama="E11.9",
        icd10_diagnosa_penyerta="I11.9, D50.9",
        icd9_tindakan=None,
        keadaan_pulang="Membaik",
        tanggal_masuk=date.today(),
        tanggal_keluar=date.today()
    )
    db_session.add(resume)
    
    # Lab Results
    lab = Penunjang(
        norm=sample_patient.norm,
        tanggal=date.today(),
        jenis_pemeriksaan="Kimia Darah",
        hasil="GDS: 385 mg/dL, HbA1c: 11.2%, Ureum: 68 mg/dL, Kreatinin: 2.1 mg/dL",
        kesimpulan="Diabetes tidak terkontrol, gangguan fungsi ginjal"
    )
    db_session.add(lab)
    
    # Vital Signs
    vital = ObservasiVital(
        norm=sample_patient.norm,
        tanggal=date.today(),
        jam=datetime.now().time(),
        suhu=36.8,
        hr=88,
        rr=20,
        sbp=160,
        dbp=95
    )
    db_session.add(vital)
    
    db_session.commit()
    
    return {
        'cppt': cppt,
        'resume': resume,
        'lab': lab,
        'vital': vital
    }

@pytest.fixture
def sample_coding_case(db_session, sample_patient):
    """Create sample coding case"""
    from app.models import Document, CodingCase, User, StatusEnum, SourceEnum, RoleEnum
    
    # Create user
    user = User(
        nip="TEST-001",
        name="Test User",
        email="test@example.com",
        password_hash="hashed",
        role=RoleEnum.coder
    )
    db_session.add(user)
    db_session.commit()
    
    # Create document
    doc = Document(
        patient_id=sample_patient.id,
        source=SourceEnum.upload,
        raw_text="RESUME MEDIS\n\nDiagnosis: Diabetes mellitus tipe 2 tidak terkontrol dengan nefropati diabetik.\nHipertensi stage 2.\nAnemia defisiensi besi.",
        upload_by=user.id,
        status=StatusEnum.uploaded
    )
    db_session.add(doc)
    db_session.commit()
    
    # Create coding case
    case = CodingCase(
        document_id=doc.id,
        status=StatusEnum.uploaded
    )
    db_session.add(case)
    db_session.commit()
    db_session.refresh(case)
    
    return case