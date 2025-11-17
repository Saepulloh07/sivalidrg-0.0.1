"""Add multi-agent system tables

Revision ID: multi_agent_001
Revises: 
Create Date: 2024-11-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'multi_agent_001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Create medical record tables
    op.create_table('cppt',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('tanggal', sa.Date(), nullable=False),
        sa.Column('jam', sa.Time(), nullable=False),
        sa.Column('profesi', sa.String(length=100), nullable=False),
        sa.Column('catatan', sa.Text(), nullable=False),
        sa.Column('instruksi', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cppt_norm'), 'cppt', ['norm'], unique=False)

    op.create_table('laporan_operasi',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('tanggal_operasi', sa.DateTime(), nullable=False),
        sa.Column('prosedur', sa.Text(), nullable=False),
        sa.Column('operator', sa.String(length=255), nullable=False),
        sa.Column('asisten', sa.String(length=255), nullable=True),
        sa.Column('temuan', sa.Text(), nullable=True),
        sa.Column('komplikasi', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_laporan_operasi_norm'), 'laporan_operasi', ['norm'], unique=False)

    op.create_table('anestesi',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('tanggal', sa.Date(), nullable=False),
        sa.Column('metode', sa.String(length=100), nullable=False),
        sa.Column('asa_score', sa.String(length=10), nullable=True),
        sa.Column('obat_induksi', sa.String(length=255), nullable=True),
        sa.Column('obat_maintenance', sa.String(length=255), nullable=True),
        sa.Column('keterangan', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_anestesi_norm'), 'anestesi', ['norm'], unique=False)

    op.create_table('penunjang',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('tanggal', sa.Date(), nullable=False),
        sa.Column('jenis_pemeriksaan', sa.String(length=255), nullable=False),
        sa.Column('hasil', sa.Text(), nullable=False),
        sa.Column('kesimpulan', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_penunjang_norm'), 'penunjang', ['norm'], unique=False)

    op.create_table('observasi_vital',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('tanggal', sa.Date(), nullable=False),
        sa.Column('jam', sa.Time(), nullable=False),
        sa.Column('suhu', sa.Float(), nullable=True),
        sa.Column('hr', sa.Integer(), nullable=True),
        sa.Column('rr', sa.Integer(), nullable=True),
        sa.Column('sbp', sa.Integer(), nullable=True),
        sa.Column('dbp', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_observasi_vital_norm'), 'observasi_vital', ['norm'], unique=False)

    op.create_table('dpjp',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('dpjp', sa.String(length=255), nullable=False),
        sa.Column('tanggal_mulai', sa.Date(), nullable=False),
        sa.Column('keterangan', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_dpjp_norm'), 'dpjp', ['norm'], unique=False)

    op.create_table('catatan_perawat',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('tanggal', sa.Date(), nullable=False),
        sa.Column('jam', sa.Time(), nullable=False),
        sa.Column('catatan', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_catatan_perawat_norm'), 'catatan_perawat', ['norm'], unique=False)

    op.create_table('resume_medis',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('diagnosa_utama', sa.Text(), nullable=False),
        sa.Column('diagnosa_penyerta', sa.Text(), nullable=True),
        sa.Column('tindakan', sa.Text(), nullable=True),
        sa.Column('icd10_diagnosa_utama', sa.String(length=20), nullable=True),
        sa.Column('icd10_diagnosa_penyerta', sa.Text(), nullable=True),
        sa.Column('icd9_tindakan', sa.Text(), nullable=True),
        sa.Column('keadaan_pulang', sa.String(length=100), nullable=True),
        sa.Column('instruksi_lanjut', sa.Text(), nullable=True),
        sa.Column('tanggal_masuk', sa.Date(), nullable=True),
        sa.Column('tanggal_keluar', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_resume_medis_norm'), 'resume_medis', ['norm'], unique=False)

    op.create_table('resep_obat',
        sa.Column('id_resep', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('norm', sa.String(length=50), nullable=False),
        sa.Column('no_kunjungan', sa.String(length=50), nullable=True),
        sa.Column('dpjp', sa.String(length=255), nullable=False),
        sa.Column('jenis_resep', sa.String(length=50), nullable=True),
        sa.Column('tgl_resep', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['norm'], ['patients.norm'], ),
        sa.PrimaryKeyConstraint('id_resep')
    )
    op.create_index(op.f('ix_resep_obat_norm'), 'resep_obat', ['norm'], unique=False)

    op.create_table('resep_obat_detail',
        sa.Column('id_detail', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('id_resep', sa.BigInteger(), nullable=False),
        sa.Column('nama_obat', sa.String(length=255), nullable=False),
        sa.Column('sediaan', sa.String(length=100), nullable=True),
        sa.Column('dosis', sa.String(length=100), nullable=True),
        sa.Column('frekuensi', sa.String(length=100), nullable=True),
        sa.Column('rute', sa.String(length=50), nullable=True),
        sa.Column('durasi_hari', sa.Integer(), nullable=True),
        sa.Column('jumlah', sa.Integer(), nullable=True),
        sa.Column('keterangan', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['id_resep'], ['resep_obat.id_resep'], ),
        sa.PrimaryKeyConstraint('id_detail')
    )
    op.create_index(op.f('ix_resep_obat_detail_id_resep'), 'resep_obat_detail', ['id_resep'], unique=False)

    # Create multi-agent system tables
    op.create_table('mismatch_flags',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('coding_case_id', sa.BigInteger(), nullable=False),
        sa.Column('mismatch_type', sa.Enum('diagnosis_mismatch', 'lab_unsupported', 'duration_anomaly', 'icd_inconsistent', 'missing_documentation', name='mismatchtypeenum'), nullable=False),
        sa.Column('severity', sa.Enum('low', 'medium', 'high', 'critical', name='severityenum'), nullable=False),
        sa.Column('field_name', sa.String(length=100), nullable=False),
        sa.Column('expected_value', sa.Text(), nullable=True),
        sa.Column('actual_value', sa.Text(), nullable=True),
        sa.Column('similarity_score', sa.Float(), nullable=True),
        sa.Column('evidence', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('recommendation', sa.Text(), nullable=True),
        sa.Column('is_resolved', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['coding_case_id'], ['coding_cases.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mismatch_flags_coding_case_id'), 'mismatch_flags', ['coding_case_id'], unique=False)

    op.create_table('auto_checklists',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('coding_case_id', sa.BigInteger(), nullable=False),
        sa.Column('checklist_data', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('overall_score', sa.Float(), nullable=False),
        sa.Column('total_checks', sa.Integer(), nullable=False),
        sa.Column('passed_checks', sa.Integer(), nullable=False),
        sa.Column('failed_checks', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['coding_case_id'], ['coding_cases.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('coding_case_id')
    )


def downgrade():
    op.drop_table('auto_checklists')
    op.drop_index(op.f('ix_mismatch_flags_coding_case_id'), table_name='mismatch_flags')
    op.drop_table('mismatch_flags')
    
    op.drop_index(op.f('ix_resep_obat_detail_id_resep'), table_name='resep_obat_detail')
    op.drop_table('resep_obat_detail')
    op.drop_index(op.f('ix_resep_obat_norm'), table_name='resep_obat')
    op.drop_table('resep_obat')
    op.drop_index(op.f('ix_resume_medis_norm'), table_name='resume_medis')
    op.drop_table('resume_medis')
    op.drop_index(op.f('ix_catatan_perawat_norm'), table_name='catatan_perawat')
    op.drop_table('catatan_perawat')
    op.drop_index(op.f('ix_dpjp_norm'), table_name='dpjp')
    op.drop_table('dpjp')
    op.drop_index(op.f('ix_observasi_vital_norm'), table_name='observasi_vital')
    op.drop_table('observasi_vital')
    op.drop_index(op.f('ix_penunjang_norm'), table_name='penunjang')
    op.drop_table('penunjang')
    op.drop_index(op.f('ix_anestesi_norm'), table_name='anestesi')
    op.drop_table('anestesi')
    op.drop_index(op.f('ix_laporan_operasi_norm'), table_name='laporan_operasi')
    op.drop_table('laporan_operasi')
    op.drop_index(op.f('ix_cppt_norm'), table_name='cppt')
    op.drop_table('cppt')