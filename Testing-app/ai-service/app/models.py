# app/models.py
from sqlalchemy import Column, Integer, String, Text, Enum, ForeignKey, DateTime, DECIMAL, JSON, Boolean, Date, BigInteger, Float, Time
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
import enum

# Tambahkan ini untuk perbaikan foreign key
BigIntegerUnsigned = BIGINT(unsigned=True)

class RoleEnum(str, enum.Enum):
    admin = "admin"
    coder = "coder"
    reviewer = "reviewer"

class GenderEnum(str, enum.Enum):
    male = "male"
    female = "female"

class SourceEnum(str, enum.Enum):
    upload = "upload"
    emr = "emr"

class StatusEnum(str, enum.Enum):
    uploaded = "uploaded"
    processing = "processing"          
    ai_processing = "ai_processing"
    ai_completed = "ai_completed"
    finalized = "finalized"
    failed = "failed"  

class CodeTypeEnum(str, enum.Enum):
    diagnosis = "diagnosis"
    procedure = "procedure"

class CodeSourceEnum(str, enum.Enum):
    ai = "ai"
    manual = "manual"

class MismatchTypeEnum(str, enum.Enum):
    diagnosis_mismatch = "diagnosis_mismatch"
    lab_unsupported = "lab_unsupported"
    duration_anomaly = "duration_anomaly"
    icd_inconsistent = "icd_inconsistent"
    missing_documentation = "missing_documentation"

class SeverityEnum(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

# Users
class User(Base):
    __tablename__ = "users"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    nip = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(RoleEnum), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    uploaded_documents = relationship("Document", back_populates="uploader", foreign_keys="Document.upload_by")
    assigned_cases = relationship("CodingCase", back_populates="assignee")
    added_codes = relationship("FinalCode", back_populates="added_by_user")
    audit_logs = relationship("AuditLog", back_populates="user")

# Patients
class Patient(Base):
    __tablename__ = "patients"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    norm = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    birth_date = Column(Date, nullable=False)
    gender = Column(Enum(GenderEnum), nullable=False)

    documents = relationship("Document", back_populates="patient")
    cppt_records = relationship("CPPT", back_populates="patient")
    surgery_reports = relationship("LaporanOperasi", back_populates="patient")
    anesthesia_records = relationship("Anestesi", back_populates="patient")
    diagnostic_tests = relationship("Penunjang", back_populates="patient")
    vital_observations = relationship("ObservasiVital", back_populates="patient")
    dpjp_records = relationship("DPJP", back_populates="patient")
    nurse_notes = relationship("CatatanPerawat", back_populates="patient")
    medical_resumes = relationship("ResumeMedis", back_populates="patient")
    prescriptions = relationship("ResepObat", back_populates="patient")

# ============= Medical Record Tables =============

class CPPT(Base):
    __tablename__ = "cppt"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    tanggal = Column(Date, nullable=False)
    jam = Column(Time, nullable=False)
    profesi = Column(String(100), nullable=False)
    catatan = Column(Text, nullable=False)
    instruksi = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="cppt_records")

class LaporanOperasi(Base):
    __tablename__ = "laporan_operasi"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    tanggal_operasi = Column(DateTime, nullable=False)
    prosedur = Column(Text, nullable=False)
    operator = Column(String(255), nullable=False)
    asisten = Column(String(255), nullable=True)
    temuan = Column(Text, nullable=True)
    komplikasi = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="surgery_reports")

class Anestesi(Base):
    __tablename__ = "anestesi"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    tanggal = Column(Date, nullable=False)
    metode = Column(String(100), nullable=False)
    asa_score = Column(String(10), nullable=True)
    obat_induksi = Column(String(255), nullable=True)
    obat_maintenance = Column(String(255), nullable=True)
    keterangan = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="anesthesia_records")

class Penunjang(Base):
    __tablename__ = "penunjang"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    tanggal = Column(Date, nullable=False)
    jenis_pemeriksaan = Column(String(255), nullable=False)
    hasil = Column(Text, nullable=False)
    kesimpulan = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="diagnostic_tests")

class ObservasiVital(Base):
    __tablename__ = "observasi_vital"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    tanggal = Column(Date, nullable=False)
    jam = Column(Time, nullable=False)
    suhu = Column(Float, nullable=True)
    hr = Column(Integer, nullable=True)
    rr = Column(Integer, nullable=True)
    sbp = Column(Integer, nullable=True)
    dbp = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="vital_observations")

class DPJP(Base):
    __tablename__ = "dpjp"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    dpjp = Column(String(255), nullable=False)
    tanggal_mulai = Column(Date, nullable=False)
    keterangan = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="dpjp_records")

class CatatanPerawat(Base):
    __tablename__ = "catatan_perawat"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    tanggal = Column(Date, nullable=False)
    jam = Column(Time, nullable=False)
    catatan = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="nurse_notes")

class ResumeMedis(Base):
    __tablename__ = "resume_medis"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    diagnosa_utama = Column(Text, nullable=False)
    diagnosa_penyerta = Column(Text, nullable=True)
    tindakan = Column(Text, nullable=True)
    icd10_diagnosa_utama = Column(String(20), nullable=True)
    icd10_diagnosa_penyerta = Column(Text, nullable=True)
    icd9_tindakan = Column(Text, nullable=True)
    keadaan_pulang = Column(String(100), nullable=True)
    instruksi_lanjut = Column(Text, nullable=True)
    tanggal_masuk = Column(Date, nullable=True)
    tanggal_keluar = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="medical_resumes")

class ResepObat(Base):
    __tablename__ = "resep_obat"
    id_resep = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    norm = Column(String(50), ForeignKey("patients.norm"), nullable=False, index=True)
    no_kunjungan = Column(String(50), nullable=True)
    dpjp = Column(String(255), nullable=False)
    jenis_resep = Column(String(50), nullable=True)
    tgl_resep = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient = relationship("Patient", back_populates="prescriptions")
    details = relationship("ResepObatDetail", back_populates="resep")

class ResepObatDetail(Base):
    __tablename__ = "resep_obat_detail"
    id_detail = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    id_resep = Column(BigIntegerUnsigned, ForeignKey("resep_obat.id_resep"), nullable=False, index=True)
    nama_obat = Column(String(255), nullable=False)
    sediaan = Column(String(100), nullable=True)
    dosis = Column(String(100), nullable=True)
    frekuensi = Column(String(100), nullable=True)
    rute = Column(String(50), nullable=True)
    durasi_hari = Column(Integer, nullable=True)
    jumlah = Column(Integer, nullable=True)
    keterangan = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    resep = relationship("ResepObat", back_populates="details")

# Documents
class Document(Base):
    __tablename__ = "documents"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    patient_id = Column(BigIntegerUnsigned, ForeignKey("patients.id"), nullable=False, index=True)
    source = Column(Enum(SourceEnum), nullable=False)
    raw_text = Column(Text, nullable=False)
    upload_by = Column(BigIntegerUnsigned, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(StatusEnum), default=StatusEnum.uploaded, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="documents")
    uploader = relationship("User", back_populates="uploaded_documents", foreign_keys=[upload_by])
    coding_case = relationship("CodingCase", back_populates="document", uselist=False)

# Coding Cases
class CodingCase(Base):
    __tablename__ = "coding_cases"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    document_id = Column(BigIntegerUnsigned, ForeignKey("documents.id"), unique=True, nullable=False, index=True)
    assigned_to = Column(BigIntegerUnsigned, ForeignKey("users.id"), nullable=True)
    status = Column(Enum(StatusEnum), default=StatusEnum.uploaded, nullable=False)
    finalized_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("Document", back_populates="coding_case")
    assignee = relationship("User", back_populates="assigned_cases")
    ai_recommendations = relationship("AIRecommendation", back_populates="coding_case", cascade="all, delete-orphan")
    final_codes = relationship("FinalCode", back_populates="coding_case", cascade="all, delete-orphan")
    ina_cbg_result = relationship("INACBGResult", back_populates="coding_case", uselist=False, cascade="all, delete-orphan")
    mismatch_flags = relationship("MismatchFlag", back_populates="coding_case", cascade="all, delete-orphan")
    auto_checklist = relationship("AutoChecklist", back_populates="coding_case", uselist=False, cascade="all, delete-orphan")

# ICD Master
class ICDMaster(Base):
    __tablename__ = "icd_master"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    code = Column(String(20), unique=True, index=True, nullable=False)
    code_type = Column(Enum(CodeTypeEnum), nullable=False, index=True)
    description = Column(Text, nullable=False)
    category = Column(String(100), nullable=True)

# AI Recommendations
class AIRecommendation(Base):
    __tablename__ = "ai_recommendations"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    coding_case_id = Column(BigIntegerUnsigned, ForeignKey("coding_cases.id"), nullable=False, index=True)
    code = Column(String(20), nullable=False)
    code_type = Column(Enum(CodeTypeEnum), nullable=False)
    description = Column(Text, nullable=False)
    confidence = Column(DECIMAL(5, 3), nullable=False)
    evidence = Column(Text, nullable=False)
    highlight_start = Column(Integer, nullable=False)
    highlight_end = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    coding_case = relationship("CodingCase", back_populates="ai_recommendations")

# Final Codes
class FinalCode(Base):
    __tablename__ = "final_codes"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    coding_case_id = Column(BigIntegerUnsigned, ForeignKey("coding_cases.id"), nullable=False, index=True)
    code = Column(String(20), nullable=False)
    code_type = Column(Enum(CodeTypeEnum), nullable=False)
    description = Column(Text, nullable=False)
    source = Column(Enum(CodeSourceEnum), nullable=False)
    added_by = Column(BigIntegerUnsigned, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    coding_case = relationship("CodingCase", back_populates="final_codes")
    added_by_user = relationship("User", back_populates="added_codes")

# INA-CBG Results
class INACBGResult(Base):
    __tablename__ = "ina_cbg_results"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    coding_case_id = Column(BigIntegerUnsigned, ForeignKey("coding_cases.id"), unique=True, nullable=False, index=True)
    cbgs_code = Column(String(20), nullable=False)
    cbgs_description = Column(Text, nullable=False)
    tariff = Column(DECIMAL(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    coding_case = relationship("CodingCase", back_populates="ina_cbg_result")

# ============= Multi-Agent System Tables =============

class MismatchFlag(Base):
    __tablename__ = "mismatch_flags"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    coding_case_id = Column(BigIntegerUnsigned, ForeignKey("coding_cases.id"), nullable=False, index=True)
    mismatch_type = Column(Enum(MismatchTypeEnum), nullable=False)
    severity = Column(Enum(SeverityEnum), nullable=False)
    field_name = Column(String(100), nullable=False)
    expected_value = Column(Text, nullable=True)
    actual_value = Column(Text, nullable=True)
    similarity_score = Column(Float, nullable=True)
    evidence = Column(JSON, nullable=True)
    recommendation = Column(Text, nullable=True)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    coding_case = relationship("CodingCase", back_populates="mismatch_flags")

class AutoChecklist(Base):
    __tablename__ = "auto_checklists"
    id = Column(BigIntegerUnsigned, primary_key=True, autoincrement=True)
    coding_case_id = Column(BigIntegerUnsigned, ForeignKey("coding_cases.id"), unique=True, nullable=False, index=True)
    checklist_data = Column(JSON, nullable=False)
    overall_score = Column(Float, nullable=False)
    total_checks = Column(Integer, nullable=False)
    passed_checks = Column(Integer, nullable=False)
    failed_checks = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    coding_case = relationship("CodingCase", back_populates="auto_checklist")

# Audit Logs
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(BigIntegerUnsigned, primary_key=True, index=True, autoincrement=True)
    user_id = Column(BigIntegerUnsigned, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(BigIntegerUnsigned, nullable=False)
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")