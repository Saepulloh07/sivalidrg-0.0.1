# tests/conftest.py
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from app.database import Base
from app.models import (
    Patient, User, Document, CodingCase, ICDMaster,
    CPPT, ResumeMedis, Penunjang, ObservasiVital, LaporanOperasi,
    GenderEnum, RoleEnum, SourceEnum, StatusEnum, CodeTypeEnum
)
from datetime import datetime, date, time
import os

# Test database URL
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "mysql+pymysql://root:sik0720@127.0.0.1:3306/medcoder_test"
)

# Buat engine
engine = create_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session")
def setup_database():
    """Buat semua tabel di awal sesi, hapus di akhir."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(setup_database):
    """
    Sesi database per test function.
    Menggunakan transaksi bersarang agar commit() tetap berfungsi,
    tapi SEMUA perubahan di-rollback di akhir test.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(session, transaction):
        if transaction.nested and not transaction._parent.nested:
            session.expire_all()
            session.begin_nested()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def sample_patient(db_session: Session):
    """Buat pasien contoh."""
    patient = Patient(
        norm="RM001234",
        name="John Doe",
        birth_date=date(1980, 1, 1),
        gender=GenderEnum.male
    )
    db_session.add(patient)
    db_session.commit()
    db_session.refresh(patient)
    return patient


@pytest.fixture
def sample_user(db_session: Session):
    """Buat user contoh."""
    user = User(
        nip="NIP001",
        name="Dr. Jane Smith",
        email="jane@example.com",
        password_hash="hashed_password",
        role=RoleEnum.coder,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def sample_document(db_session: Session, sample_patient, sample_user):
    """Buat dokumen contoh."""
    document = Document(
        patient_id=sample_patient.id,
        source=SourceEnum.upload,
        raw_text="Pasien datang dengan keluhan demam tinggi, batuk, dan sesak napas. "
                 "Diagnosis: Pneumonia bakterial. Pemeriksaan lab menunjukkan leukosit 15000/µL. "
                 "Tindakan: Pemberian antibiotik spektrum luas.",
        upload_by=sample_user.id,
        status=StatusEnum.uploaded
    )
    db_session.add(document)
    db_session.commit()
    db_session.refresh(document)
    return document


@pytest.fixture
def sample_coding_case(db_session: Session, sample_document):
    """Buat coding case contoh."""
    coding_case = CodingCase(
        document_id=sample_document.id,
        status=StatusEnum.ai_processing
    )
    db_session.add(coding_case)
    db_session.commit()
    db_session.refresh(coding_case)
    return coding_case


@pytest.fixture
def sample_icd_master(db_session: Session):
    """Buat data master ICD."""
    icd_records = [
        ICDMaster(code="J18.9", code_type=CodeTypeEnum.diagnosis, description="Pneumonia, tidak spesifik", category="Respiratory"),
        ICDMaster(code="J18.0", code_type=CodeTypeEnum.diagnosis, description="Pneumonia bakterial tidak spesifik", category="Respiratory"),
        ICDMaster(code="E11.9", code_type=CodeTypeEnum.diagnosis, description="Diabetes mellitus tipe 2 tanpa komplikasi", category="Endocrine"),
        ICDMaster(code="I10", code_type=CodeTypeEnum.diagnosis, description="Hipertensi esensial", category="Circulatory"),
        ICDMaster(code="A41.9", code_type=CodeTypeEnum.diagnosis, description="Sepsis tidak spesifik", category="Infectious"),
        ICDMaster(code="96.04", code_type=CodeTypeEnum.procedure, description="Intubasi endotrakeal", category="Respiratory Procedure"),
    ]
    db_session.add_all(icd_records)
    db_session.commit()
    return icd_records


@pytest.fixture
def sample_cppt_records(db_session: Session, sample_patient):
    """Buat catatan CPPT."""
    cppt_records = [
        CPPT(
            norm=sample_patient.norm,
            tanggal=date(2024, 11, 10),
            jam=time(10, 0),
            profesi="Dokter",
            catatan="Pasien datang dengan keluhan demam tinggi 39°C, batuk produktif, "
                   "dan sesak napas. Diagnosis kerja: Pneumonia bakterial. "
                   "Rencana: Pemberian antibiotik dan monitoring ketat.",
            instruksi="Ceftriaxone 2g IV q24h, Paracetamol 500mg PRN"
        ),
        CPPT(
            norm=sample_patient.norm,
            tanggal=date(2024, 11, 11),
            jam=time(8, 0),
            profesi="Dokter",
            catatan="Pasien membaik, demam turun menjadi 37.5°C, batuk berkurang. "
                   "Diagnosis: Pneumonia bakterial (respon baik terhadap antibiotik).",
            instruksi="Lanjutkan terapi antibiotik"
        ),
    ]
    db_session.add_all(cppt_records)
    db_session.commit()
    return cppt_records


@pytest.fixture
def sample_resume_medis(db_session: Session, sample_patient):
    """Buat resume medis."""
    resume = ResumeMedis(
        norm=sample_patient.norm,
        diagnosa_utama="Pneumonia bakterial",
        diagnosa_penyerta="Hipertensi stage 1",
        tindakan="Pemberian antibiotik intravena",
        icd10_diagnosa_utama="J18.0",
        icd10_diagnosa_penyerta="I10",
        icd9_tindakan=None,
        keadaan_pulang="Membaik",
        instruksi_lanjut="Kontrol 1 minggu",
        tanggal_masuk=date(2024, 11, 10),
        tanggal_keluar=date(2024, 11, 15)
    )
    db_session.add(resume)
    db_session.commit()
    db_session.refresh(resume)
    return resume


@pytest.fixture
def sample_lab_results(db_session: Session, sample_patient):
    """Buat hasil lab."""
    lab_results = [
        Penunjang(
            norm=sample_patient.norm,
            tanggal=date(2024, 11, 10),
            jenis_pemeriksaan="Hematologi Lengkap",
            hasil="Leukosit: 15000/µL, Hemoglobin: 14 g/dL, Hematokrit: 42%, "
                  "Trombosit: 250000/µL, Neutrofil: 80%",
            kesimpulan="Leukositosis dengan neutrofilia, menunjang infeksi bakterial"
        ),
        Penunjang(
            norm=sample_patient.norm,
            tanggal=date(2024, 11, 10),
            jenis_pemeriksaan="CRP",
            hasil="CRP: 120 mg/L",
            kesimpulan="CRP tinggi, menunjang proses inflamasi akut"
        ),
    ]
    db_session.add_all(lab_results)
    db_session.commit()
    return lab_results


@pytest.fixture
def sample_vital_signs(db_session: Session, sample_patient):
    """Buat observasi vital."""
    vital_signs = [
        ObservasiVital(norm=sample_patient.norm, tanggal=date(2024, 11, 10), jam=time(10, 0), suhu=39.0, hr=100, rr=24, sbp=145, dbp=92),
        ObservasiVital(norm=sample_patient.norm, tanggal=date(2024, 11, 11), jam=time(8, 0), suhu=37.5, hr=88, rr=20, sbp=140, dbp=90),
        ObservasiVital(norm=sample_patient.norm, tanggal=date(2024, 11, 12), jam=time(8, 0), suhu=36.8, hr=80, rr=18, sbp=135, dbp=85),
    ]
    db_session.add_all(vital_signs)
    db_session.commit()
    return vital_signs


@pytest.fixture
def sample_surgery_report(db_session: Session, sample_patient):
    """Buat laporan operasi."""
    report = LaporanOperasi(
        norm=sample_patient.norm,
        tanggal_operasi=datetime(2024, 11, 11, 14, 0),
        prosedur="Appendectomy",
        operator="Dr. John Smith",
        asisten="Dr. Jane Doe",
        temuan="Appendix inflamed, perforated",
        komplikasi="None"
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


@pytest.fixture
def sepsis_scenario(db_session: Session, sample_patient):
    cppt = CPPT(
        norm=sample_patient.norm,
        tanggal=date(2024, 11, 10),
        jam=time(10, 0),
        profesi="Dokter",
        catatan="Pasien dengan demam tinggi, hipotensi, takikardia. "
               "Diagnosis: Sepsis. Rencana: Resusitasi cairan, antibiotik broad spectrum.",
        instruksi="Ceftriaxone + Metronidazole, loading cairan"
    )
    lab = Penunjang(
        norm=sample_patient.norm,
        tanggal=date(2024, 11, 10),
        jenis_pemeriksaan="Hematologi",
        hasil="Leukosit: 8000/µL, Neutrofil: 60%, CRP: 80 mg/L",
        kesimpulan="Leukosit normal"
    )
    resume = ResumeMedis(
        norm=sample_patient.norm,
        diagnosa_utama="Sepsis",
        icd10_diagnosa_utama="A41.9",
        tanggal_masuk=date(2024, 11, 10),
        tanggal_keluar=date(2024, 11, 15)
    )
    db_session.add_all([cppt, lab, resume])
    db_session.commit()
    return {"cppt": cppt, "lab": lab, "resume": resume}


@pytest.fixture
def diagnosis_mismatch_scenario(db_session: Session, sample_patient):
    cppt = CPPT(
        norm=sample_patient.norm,
        tanggal=date(2024, 11, 10),
        jam=time(10, 0),
        profesi="Dokter",
        catatan="Pasien dengan batuk produktif, demam, sesak. "
               "Diagnosis: Pneumonia bakterial.",
        instruksi="Antibiotik"
    )
    resume = ResumeMedis(
        norm=sample_patient.norm,
        diagnosa_utama="Bronkitis akut",
        icd10_diagnosa_utama="J20.9",
        tanggal_masuk=date(2024, 11, 10),
        tanggal_keluar=date(2024, 11, 12)
    )
    db_session.add_all([cppt, resume])
    db_session.commit()
    return {"cppt": cppt, "resume": resume}


@pytest.fixture
def duration_anomaly_scenario(db_session: Session, sample_patient):
    resume = ResumeMedis(
        norm=sample_patient.norm,
        diagnosa_utama="Gastritis akut",
        icd10_diagnosa_utama="K29.0",
        tanggal_masuk=date(2024, 10, 1),
        tanggal_keluar=date(2024, 10, 20)
    )
    db_session.add(resume)
    db_session.commit()
    return resume


@pytest.fixture
def incomplete_documentation_scenario(db_session: Session, sample_patient):
    resume = ResumeMedis(
        norm=sample_patient.norm,
        diagnosa_utama="Appendisitis akut",
        icd10_diagnosa_utama="K35.8",
        tindakan="Appendectomy",
        icd9_tindakan="47.09",
        tanggal_masuk=date(2024, 11, 10),
        tanggal_keluar=date(2024, 11, 13)
    )
    cppt = CPPT(
        norm=sample_patient.norm,
        tanggal=date(2024, 11, 10),
        jam=time(10, 0),
        profesi="Dokter",
        catatan="Appendisitis",
        instruksi="Operasi"
    )
    db_session.add_all([resume, cppt])
    db_session.commit()
    return {"resume": resume, "cppt": cppt}


@pytest.fixture
def perfect_documentation_scenario(db_session: Session, sample_patient):
    """Scenario with perfect documentation - no mismatches."""
    resume = ResumeMedis(
        norm=sample_patient.norm,
        diagnosa_utama="Pneumonia bakterial",
        diagnosa_penyerta=None,  # No secondary diagnosis
        icd10_diagnosa_utama="J18.0",
        tindakan="Pemberian antibiotik intravena",
        tanggal_masuk=date(2024, 11, 10),
        tanggal_keluar=date(2024, 11, 15)
    )
    
    cppt = CPPT(
        norm=sample_patient.norm,
        tanggal=date(2024, 11, 10),
        jam=time(10, 0),
        profesi="Dokter",
        catatan="Pasien dengan pneumonia bakterial, kondisi stabil, "
               "terapi antibiotik intravena dilanjutkan, monitoring ketat.",
        instruksi="Ceftriaxone 2g IV q24h"
    )
    
    lab = Penunjang(
        norm=sample_patient.norm,
        tanggal=date(2024, 11, 10),
        jenis_pemeriksaan="Hematologi",
        hasil="Leukosit: 15000/µL, CRP: 120 mg/L",
        kesimpulan="Leukositosis, mendukung infeksi bakterial"
    )
    
    vital = ObservasiVital(
        norm=sample_patient.norm,
        tanggal=date(2024, 11, 10),
        jam=time(10, 0),
        suhu=38.5,
        hr=95,
        rr=22,
        sbp=120,
        dbp=80
    )
    
    db_session.add_all([resume, cppt, lab, vital])
    db_session.commit()
    return {"resume": resume, "cppt": cppt, "lab": lab, "vital": vital}