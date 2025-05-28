"""
Setup script for PostgreSQL Task Storage and Context Engine
"""

from setuptools import setup, find_packages

with open("README_TASK_STORAGE.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

with open("task_storage/requirements.txt", "r", encoding="utf-8") as fh:
    requirements = [line.strip() for line in fh if line.strip() and not line.startswith("#")]

setup(
    name="task-storage-engine",
    version="1.0.0",
    author="Codegen Task Storage Team",
    author_email="team@codegen.sh",
    description="PostgreSQL Task Storage and Context Engine for AI-driven development",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/Zeeeepa/claude-task-master",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Database :: Database Engines/Servers",
        "Topic :: Software Development :: Version Control",
    ],
    python_requires=">=3.8",
    install_requires=requirements,
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.23.0",
            "pytest-cov>=4.1.0",
            "black>=23.12.0",
            "isort>=5.13.0",
            "mypy>=1.8.0",
            "flake8>=7.0.0",
        ],
        "redis": ["redis>=5.0.0"],
        "celery": ["celery>=5.3.0"],
        "sqlalchemy": ["sqlalchemy>=2.0.0", "alembic>=1.13.0"],
    },
    entry_points={
        "console_scripts": [
            "task-storage-example=examples.basic_usage_example:main",
        ],
    },
    include_package_data=True,
    package_data={
        "database": ["schemas/*.sql", "migrations/*.sql"],
        "examples": ["*.py"],
        "tests": ["*.py"],
    },
    project_urls={
        "Bug Reports": "https://github.com/Zeeeepa/claude-task-master/issues",
        "Source": "https://github.com/Zeeeepa/claude-task-master",
        "Documentation": "https://github.com/Zeeeepa/claude-task-master/blob/main/README_TASK_STORAGE.md",
    },
)

