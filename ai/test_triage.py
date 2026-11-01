import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from service import create_server
from triage_model import MODEL, MODEL_ID, TriageModel, classify


class ModelTests(unittest.TestCase):
    def test_trained_model_metadata(self):
        self.assertEqual(MODEL.metadata["amostras"], 32)
        self.assertFalse(MODEL.metadata["validacaoClinica"])
        self.assertEqual(MODEL.metadata["linguagem"], "python")
        self.assertRegex(MODEL.version, r"^[a-f0-9]{64}$")

    def test_prediction_has_python_origin(self):
        result = classify({"descricao": "consulta de rotina para acompanhamento e renovacao de receita"})
        self.assertEqual(result["estado"], "avaliada_ia")
        self.assertEqual(result["prioridade"], "baixa")
        self.assertEqual(result["modelo"], MODEL_ID)
        self.assertEqual(result["linguagem"], "python")
        self.assertNotIn("confidence", result)

    def test_unknown_or_negated_input_abstains(self):
        for description in ["Teste", "xyz123", "sem febre e sem dor", "não sinto dor no peito"]:
            result = classify({"descricao": description})
            self.assertEqual(result["estado"], "sem_resultado")
            self.assertIsNone(result["prioridade"])

    def test_invalid_inputs(self):
        for payload in [None, [], {"sintomas": "febre"}, {"sintomas": [8]}, {"descricao": "x" * 2001}]:
            with self.assertRaises(ValueError):
                classify(payload)

    def test_invalid_training_corpus_is_rejected(self):
        with self.assertRaises(ValueError):
            TriageModel({"examples": {}})


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server(0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_address[1])

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_health_endpoint(self):
        with urlopen(self.base + "/health", timeout=3) as reply:
            data = json.load(reply)
        self.assertEqual(data["servico"], "triaqui-python-ia")
        self.assertEqual(data["linguagem"], "python")

    def test_predict_endpoint(self):
        request = Request(self.base + "/predict", data=json.dumps({"descricao": "consulta de rotina para acompanhamento preventivo"}).encode(), headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=3) as reply:
            data = json.load(reply)
        self.assertEqual(data["estado"], "avaliada_ia")
        self.assertEqual(data["linguagem"], "python")

    def test_invalid_body_returns_422(self):
        request = Request(self.base + "/predict", data=b'{"sintomas": "invalido"}', headers={"Content-Type": "application/json"})
        with self.assertRaises(HTTPError) as error:
            urlopen(request, timeout=3)
        self.assertEqual(error.exception.code, 422)


if __name__ == "__main__":
    unittest.main()
