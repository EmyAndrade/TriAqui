"""Modelo demonstrativo de triagem treinado e executado inteiramente em Python.

Os exemplos são sintéticos. O modelo não tem validação clínica e exige revisão
médica antes de qualquer alteração na prioridade de atendimento.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path

CLASSES = ("baixa", "moderada", "alta", "emergencia")
MODEL_ID = "triaqui-nb-python-sintetico-v2"
STOPWORDS = set("a o as os de do da dos das e em para com um uma me eu estou tenho desde".split())


def normalize(value: str) -> str:
    return "".join(char for char in unicodedata.normalize("NFD", value) if not unicodedata.combining(char)).lower()


def features(value: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", normalize(value))
    return ([word for word in tokens if word not in STOPWORDS]
            + [" ".join(tokens[i:i + 2]) for i in range(len(tokens) - 1)]
            + [" ".join(tokens[i:i + 3]) for i in range(len(tokens) - 2)])


class TriageModel:
    def __init__(self, corpus: dict):
        self.vocabulary: set[str] = set()
        self.counts: dict[str, Counter] = {}
        self.totals: dict[str, int] = {}
        self.documents: dict[str, int] = {}
        for category in CLASSES:
            examples = corpus.get("examples", {}).get(category)
            if not isinstance(examples, list) or not examples or any(not isinstance(row, str) for row in examples):
                raise ValueError("Corpus de demonstração incompleto.")
            words = Counter(word for example in examples for word in features(example))
            self.counts[category] = words
            self.totals[category] = sum(words.values())
            self.documents[category] = len(examples)
            self.vocabulary.update(words)
        serialized = json.dumps({"implementation": MODEL_ID, "corpus": corpus}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        self.version = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @property
    def metadata(self) -> dict:
        return {"modelo": MODEL_ID, "versao": self.version, "amostras": sum(self.documents.values()), "validacaoClinica": False, "experimental": True, "linguagem": "python"}

    def classify(self, sintomas: list[str], descricao: str) -> dict:
        base = {"modelo": MODEL_ID, "versao": self.version, "experimental": True, "linguagem": "python", "servico": "triaqui-python-ia"}

        def abstain(message: str) -> dict:
            return {**base, "estado": "sem_resultado", "prioridade": None, "resumo": message, "sinais": []}

        value = ". ".join(sintomas) + ". " + descricao
        if re.search(r"\b(nao|sem|nego|nega|negando)\b", normalize(value)):
            return abstain("O texto exige interpretação de contexto. Aguardando avaliação profissional.")
        known = [word for word in features(value) if word in self.vocabulary]
        if len(set(known)) < 4:
            return abstain("Informações insuficientes para o modelo experimental. Aguardando avaliação profissional.")
        total_documents = sum(self.documents.values())
        scores = []
        for category in CLASSES:
            score = math.log(self.documents[category] / total_documents)
            score += sum(math.log((self.counts[category][word] + 1) / (self.totals[category] + len(self.vocabulary))) for word in known)
            scores.append((category, score))
        scores.sort(key=lambda row: row[1], reverse=True)
        if (scores[0][1] - scores[1][1]) / len(known) < 0.08:
            return abstain("O modelo não diferenciou as prioridades com clareza. Aguardando avaliação profissional.")
        return {**base, "estado": "avaliada_ia", "prioridade": scores[0][0],
                "resumo": "Sugestão estatística de um modelo Python treinado com exemplos fictícios; depende de confirmação médica.",
                "sinais": list(dict.fromkeys(word for word in known if " " not in word))[:8]}


MODEL = TriageModel(json.loads(Path(__file__).with_name("corpus-demo.json").read_text(encoding="utf-8")))


def classify(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Envie um objeto JSON.")
    symptoms = payload.get("sintomas", [])
    description = payload.get("descricao", "")
    if not isinstance(symptoms, list) or len(symptoms) > 20 or any(not isinstance(s, str) or len(s) > 150 for s in symptoms):
        raise ValueError("Sintomas inválidos.")
    if not isinstance(description, str) or len(description) > 2000:
        raise ValueError("Descrição inválida.")
    return MODEL.classify(symptoms, description)
